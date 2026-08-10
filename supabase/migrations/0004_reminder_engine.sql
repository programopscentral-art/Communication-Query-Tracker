-- ============================================================================
-- 0004_reminder_engine.sql — precompute + drain reminders
-- Accuracy core: idempotent job generation, parallel-safe draining, retries.
-- ============================================================================

-- ── Which BOAs should be reminded for a given task ───────────────────────────
-- Active BOAs assigned to the task's university, opted into reminders, whose
-- team_scope is 'all' ('') or matches the task's team, within their date window.
create or replace function public.eligible_boas_for_task(p_task tasks)
returns table (boa_id uuid) language sql stable as $$
  select b.id
  from university_boas ub
  join boas b on b.id = ub.boa_id
  where ub.university_id = p_task.university_id
    and ub.receive_reminders
    and b.active
    and (ub.team_scope = '' or ub.team_scope = coalesce(p_task.team, ''))
    and (ub.effective_from is null or ub.effective_from <= current_date)
    and (ub.effective_to   is null or ub.effective_to   >= current_date)
$$;

-- ── (Re)generate reminder jobs for one task ──────────────────────────────────
-- Idempotent: safe to call on every task write. Uses the unique constraint
-- (task_id, boa_id, offset_min) so re-runs update fire_at instead of duplicating.
create or replace function public.generate_reminder_jobs(p_task_id uuid)
returns void language plpgsql as $$
declare
  t        tasks;
  offsets  int[];
  reminders_on boolean;
begin
  select * into t from tasks where id = p_task_id;
  if not found then return; end if;

  select reminders_enabled into reminders_on from app_settings where id = 1;

  -- No reminders needed if disabled, unscheduled, or already finished.
  if not reminders_on
     or t.publish_at is null
     or t.execution_status in ('published') then
    -- cancel any still-pending jobs for this task
    update reminder_jobs
      set status = 'cancelled'
      where task_id = p_task_id and status in ('pending');
    return;
  end if;

  offsets := coalesce(
    t.reminder_offsets_min,
    (select default_reminder_offsets_min from app_settings where id = 1)
  );

  -- Upsert a job per (eligible BOA × offset).
  insert into reminder_jobs (task_id, boa_id, offset_min, fire_at, status)
  select p_task_id, e.boa_id, o.offset_min,
         t.publish_at - make_interval(mins => o.offset_min),
         'pending'
  from eligible_boas_for_task(t) e
  cross join unnest(offsets) as o(offset_min)
  on conflict (task_id, boa_id, offset_min) do update
    set fire_at = excluded.fire_at
    -- only reschedule jobs that haven't gone out yet
    where reminder_jobs.status = 'pending';

  -- Drop pending jobs for BOAs / offsets that no longer apply
  -- (e.g. reassignment, changed offsets, team_scope change).
  delete from reminder_jobs r
  where r.task_id = p_task_id
    and r.status = 'pending'
    and (
      r.offset_min <> all (offsets)
      or r.boa_id not in (select boa_id from eligible_boas_for_task(t))
    );
end $$;

-- ── Trigger: regenerate jobs whenever the relevant task fields change ─────────
create or replace function public.tasks_reminder_sync()
returns trigger language plpgsql as $$
begin
  perform generate_reminder_jobs(new.id);
  return new;
end $$;

create trigger tasks_reminder_sync_trg
  after insert or update of publish_at, university_id, team,
                           execution_status, reminder_offsets_min
  on tasks
  for each row execute function tasks_reminder_sync();

-- ── Claim due jobs (parallel-safe) ───────────────────────────────────────────
-- The drainer calls this. FOR UPDATE SKIP LOCKED means multiple workers never
-- grab the same job → no duplicate WhatsApp sends. Marks them 'sending'.
create or replace function public.claim_due_reminders(p_limit int default 200)
returns setof reminder_jobs language plpgsql security definer set search_path = public as $$
begin
  -- Recover jobs stuck 'sending' (worker crashed) back to pending after 5 min.
  update reminder_jobs
    set status = 'pending'
    where status = 'sending' and claimed_at < now() - interval '5 minutes';

  return query
  update reminder_jobs r
    set status = 'sending', attempts = attempts + 1, claimed_at = now()
  from (
    select id from reminder_jobs
    where status = 'pending' and fire_at <= now()
    order by fire_at
    for update skip locked
    limit p_limit
  ) due
  where r.id = due.id
  returning r.*;
end $$;

-- Enriched details the Edge Function needs to build the WhatsApp message.
create or replace view reminder_job_details as
  select r.id as job_id, r.offset_min, r.attempts, r.status,
         b.whatsapp_e164, b.name as boa_name, b.preferred_language,
         u.name as university_name, u.code as university_code, u.timezone,
         t.id as task_id, t.team, t.update_type, t.category, t.priority,
         t.channel, t.content_type, t.target_audience, t.message_content,
         t.poster_drive_link, t.publish_at, t.special_instructions,
         t.execution_status
  from reminder_jobs r
  join boas b on b.id = r.boa_id
  join tasks t on t.id = r.task_id
  join universities u on u.id = t.university_id;

-- ── Mark results (called by the Edge Function after sending) ─────────────────
create or replace function public.mark_reminder_sent(p_id uuid, p_wa_message_id text)
returns void language sql security definer set search_path = public as $$
  update reminder_jobs
    set status = 'sent', wa_message_id = p_wa_message_id, sent_at = now(), error = null
    where id = p_id;
$$;

create or replace function public.mark_reminder_failed(p_id uuid, p_error text, p_max_attempts int default 4)
returns void language plpgsql security definer set search_path = public as $$
begin
  update reminder_jobs
    set status = case when attempts >= p_max_attempts then 'failed' else 'pending' end,
        error = p_error,
        claimed_at = null
    where id = p_id;
end $$;

-- Skip a job whose task is already published (checked at send time by the EF,
-- but also enforceable here).
create or replace function public.skip_reminder(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update reminder_jobs set status = 'skipped' where id = p_id;
$$;
