-- ============================================================================
-- 0030_whatsapp_sender.sql — everything the WhatsApp sender needs.
--
--  • app_settings: master switch (OFF by default), test mode (ON by default —
--    only listed numbers receive messages), quiet hours (IST), max lateness,
--    last-run status.
--  • reminder_jobs / event_nudges: skip reason + Meta delivery status
--    (sent → delivered → read, or failed) from the webhook.
--  • claim_due_reminders(limit, max_late_min): never sends a reminder whose time
--    passed more than N minutes ago — it is marked skipped ("too late") instead.
--    This also retires the pre-go-live backlog automatically.
--  • claim_event_nudges(limit, max_age_hours): same for report reminders.
--  • generate_reminder_jobs: a cancelled/skipped job comes back to life when its
--    task is rescheduled into the future (or un-published).
--  • Security: the claim/mark functions are SECURITY DEFINER and were callable
--    by anon/authenticated via the API — now service_role only.
-- ============================================================================

-- ── Settings ─────────────────────────────────────────────────────────────────
alter table app_settings add column if not exists whatsapp_enabled      boolean not null default false;
alter table app_settings add column if not exists whatsapp_test_mode    boolean not null default true;
alter table app_settings add column if not exists whatsapp_test_numbers text[]  not null default '{}';
alter table app_settings add column if not exists whatsapp_quiet_start  time    not null default '22:00';
alter table app_settings add column if not exists whatsapp_quiet_end    time    not null default '08:00';
alter table app_settings add column if not exists whatsapp_max_late_min int     not null default 5;
alter table app_settings add column if not exists last_whatsapp_run_at      timestamptz;
alter table app_settings add column if not exists last_whatsapp_run_ok      boolean;
alter table app_settings add column if not exists last_whatsapp_run_message text;
alter table app_settings drop constraint if exists app_settings_whatsapp_late_check;
alter table app_settings add constraint app_settings_whatsapp_late_check check (whatsapp_max_late_min between 1 and 60);

-- ── Reminder jobs: why skipped + delivery status from Meta ───────────────────
alter table reminder_jobs add column if not exists skip_reason     text;
alter table reminder_jobs add column if not exists delivery_status text;
alter table reminder_jobs add column if not exists delivery_at     timestamptz;
create index if not exists reminder_jobs_wa_msg_idx on reminder_jobs (wa_message_id) where wa_message_id is not null;
create index if not exists reminder_jobs_sending_idx on reminder_jobs (claimed_at) where status = 'sending';

-- ── Event nudges: a 'sending' state + delivery fields ────────────────────────
alter table event_nudges drop constraint if exists event_nudges_status_check;
alter table event_nudges add constraint event_nudges_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped'));
alter table event_nudges add column if not exists attempts        int not null default 0;
alter table event_nudges add column if not exists claimed_at      timestamptz;
alter table event_nudges add column if not exists wa_message_id   text;
alter table event_nudges add column if not exists delivery_status text;
alter table event_nudges add column if not exists delivery_at     timestamptz;
create index if not exists event_nudges_wa_msg_idx on event_nudges (wa_message_id) where wa_message_id is not null;

-- ── One-time: retire everything that is already late ─────────────────────────
update reminder_jobs
   set status = 'skipped', skip_reason = 'Expired before WhatsApp went live'
 where status = 'pending' and fire_at < now();
update event_nudges
   set status = 'skipped', error = 'Expired before WhatsApp went live'
 where status = 'queued' and created_at < now() - interval '1 day';

-- ── Claim due reminders (with the lateness guard) ─────────────────────────────
drop function if exists public.claim_due_reminders(int);
create or replace function public.claim_due_reminders(p_limit int default 100, p_max_late_min int default 5)
returns setof reminder_jobs language plpgsql security definer set search_path = public as $$
begin
  -- A worker died mid-send: release after 5 min (the lateness guard below then
  -- decides whether it is still worth sending).
  update reminder_jobs set status = 'pending', claimed_at = null
   where status = 'sending' and claimed_at < now() - interval '5 minutes';

  update reminder_jobs
     set status = 'skipped', skip_reason = 'Too late — the reminder time had already passed', claimed_at = null
   where status = 'pending' and fire_at < now() - make_interval(mins => p_max_late_min);

  return query
  update reminder_jobs r
     set status = 'sending', attempts = r.attempts + 1, claimed_at = now()
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

-- Quiet hours: retire whatever falls due while sending is paused.
create or replace function public.skip_due_reminders(p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update reminder_jobs set status = 'skipped', skip_reason = p_reason, claimed_at = null
   where status = 'pending' and fire_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Claim queued report reminders ─────────────────────────────────────────────
create or replace function public.claim_event_nudges(p_limit int default 100, p_max_age_hours int default 24)
returns setof event_nudges language plpgsql security definer set search_path = public as $$
begin
  update event_nudges set status = 'queued', claimed_at = null
   where status = 'sending' and claimed_at < now() - interval '5 minutes';

  update event_nudges
     set status = 'skipped', error = 'Expired — not sent within ' || p_max_age_hours || ' h of being queued', claimed_at = null
   where status = 'queued' and created_at < now() - make_interval(hours => p_max_age_hours);

  return query
  update event_nudges n
     set status = 'sending', attempts = n.attempts + 1, claimed_at = now()
    from (
      select id from event_nudges
       where status = 'queued'
       order by created_at
       for update skip locked
       limit p_limit
    ) due
   where n.id = due.id
  returning n.*;
end $$;

-- ── Delivery receipts from the Meta webhook ───────────────────────────────────
-- Statuses can arrive out of order; only move forward (sent < delivered < read).
-- 'failed' always wins and marks the row failed with Meta's reason.
create or replace function public.apply_wa_status(p_message_id text, p_status text, p_at timestamptz, p_error text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  m int;
  rank_new int := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end;
begin
  if rank_new = 0 or coalesce(p_message_id, '') = '' then return 0; end if;

  update reminder_jobs
     set delivery_status = p_status,
         delivery_at = p_at,
         status = case when p_status = 'failed' then 'failed'::reminder_status else status end,
         error = case when p_status = 'failed' then coalesce(p_error, 'Delivery failed') else error end
   where wa_message_id = p_message_id
     and rank_new > case delivery_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end;
  get diagnostics m = row_count; n := n + m;

  update event_nudges
     set delivery_status = p_status,
         delivery_at = p_at,
         status = case when p_status = 'failed' then 'failed' else status end,
         error = case when p_status = 'failed' then coalesce(p_error, 'Delivery failed') else error end
   where wa_message_id = p_message_id
     and rank_new > case delivery_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end;
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;

-- ── Regenerate: revive cancelled/skipped jobs whose new time is in the future ─
create or replace function public.generate_reminder_jobs(p_task_id uuid)
returns void language plpgsql as $$
declare
  t            tasks;
  offsets      int[];
  reminders_on boolean;
  auto_on      boolean;
begin
  select * into t from tasks where id = p_task_id;
  if not found then return; end if;

  select reminders_enabled into reminders_on from app_settings where id = 1;
  select coalesce(auto_enabled, true), offsets_min
    into auto_on, offsets
    from reminder_prefs where university_id = t.university_id;

  -- effective offsets: task override wins, else university pref, else global
  offsets := coalesce(
    t.reminder_offsets_min,
    offsets,
    (select default_reminder_offsets_min from app_settings where id = 1)
  );

  -- If globally off, auto disabled for this uni, unscheduled, or already done →
  -- clear pending AUTO jobs (offset<>0) but keep any manual (offset 0) jobs.
  if not reminders_on
     or not coalesce(auto_on, true)
     or t.publish_at is null
     or t.execution_status in ('published') then
    update reminder_jobs
      set status = 'cancelled'
      where task_id = p_task_id and status = 'pending' and offset_min <> 0;
    return;
  end if;

  insert into reminder_jobs (task_id, boa_id, offset_min, fire_at, status)
  select p_task_id, e.boa_id, o.offset_min,
         t.publish_at - make_interval(mins => o.offset_min), 'pending'
  from eligible_boas_for_task(t) e
  cross join unnest(offsets) as o(offset_min)
  on conflict (task_id, boa_id, offset_min) do update
    set fire_at = excluded.fire_at,
        status = 'pending',
        attempts = 0,
        claimed_at = null,
        error = null,
        skip_reason = null
    where reminder_jobs.status = 'pending'
       or (reminder_jobs.status in ('cancelled', 'skipped') and excluded.fire_at > now());

  delete from reminder_jobs r
  where r.task_id = p_task_id
    and r.status = 'pending'
    and r.offset_min <> 0
    and (
      r.offset_min <> all (offsets)
      or r.boa_id not in (select boa_id from eligible_boas_for_task(t))
    );
end $$;

-- ── Expose the new columns to the admin reminder log (appended at the end) ───
create or replace view reminder_job_details as
  select r.id as job_id, r.boa_id, r.offset_min, r.attempts, r.status, r.fire_at, r.sent_at,
         b.whatsapp_e164, b.name as boa_name, b.preferred_language,
         u.name as university_name, u.code as university_code, u.timezone,
         t.id as task_id, t.team, t.update_type, t.category, t.priority,
         t.channel, t.content_type, t.target_audience, t.message_content,
         t.poster_drive_link, t.publish_at, t.special_instructions,
         t.execution_status,
         r.skip_reason, r.error, r.delivery_status, r.wa_message_id
  from reminder_jobs r
  join boas b on b.id = r.boa_id
  join tasks t on t.id = r.task_id
  join universities u on u.id = t.university_id;

-- ── Lock the sender's functions to the service role ───────────────────────────
revoke execute on function public.claim_due_reminders(int, int)            from public, anon, authenticated;
revoke execute on function public.skip_due_reminders(text)                 from public, anon, authenticated;
revoke execute on function public.claim_event_nudges(int, int)             from public, anon, authenticated;
revoke execute on function public.apply_wa_status(text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.mark_reminder_sent(uuid, text)           from public, anon, authenticated;
revoke execute on function public.mark_reminder_failed(uuid, text, int)    from public, anon, authenticated;
revoke execute on function public.skip_reminder(uuid)                      from public, anon, authenticated;
revoke execute on function public.enqueue_manual_reminder(uuid)            from anon;
grant  execute on function public.claim_due_reminders(int, int)            to service_role;
grant  execute on function public.skip_due_reminders(text)                 to service_role;
grant  execute on function public.claim_event_nudges(int, int)             to service_role;
grant  execute on function public.apply_wa_status(text, text, timestamptz, text) to service_role;
grant  execute on function public.mark_reminder_sent(uuid, text)           to service_role;
grant  execute on function public.mark_reminder_failed(uuid, text, int)    to service_role;
grant  execute on function public.skip_reminder(uuid)                      to service_role;
