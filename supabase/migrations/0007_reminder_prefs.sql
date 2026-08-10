-- ============================================================================
-- 0007_reminder_prefs.sql
-- Per-university reminder timing (offsets) + auto/manual mode, editable by
-- admins AND that university's staff. Plus a manual "send now" enqueue.
-- ============================================================================

create table if not exists reminder_prefs (
  university_id uuid primary key references universities(id) on delete cascade,
  offsets_min   int[]   not null default '{15,10}',   -- minutes-before to remind
  auto_enabled  boolean not null default true,        -- true = cron auto-sends
  updated_by    uuid references app_users(id),
  updated_at    timestamptz not null default now()
);

-- Seed a row per existing university from the global default.
insert into reminder_prefs (university_id, offsets_min)
  select id, (select default_reminder_offsets_min from app_settings where id = 1)
  from universities
on conflict (university_id) do nothing;

alter table reminder_prefs enable row level security;

-- Admins manage all; a BOA can read + edit prefs for their assigned universities.
create policy rp_admin_all on reminder_prefs
  for all using (is_admin()) with check (is_admin());
create policy rp_boa_read on reminder_prefs
  for select using (university_id in (select my_university_ids()));
create policy rp_boa_write on reminder_prefs
  for update using (university_id in (select my_university_ids()))
  with check (university_id in (select my_university_ids()));
create policy rp_boa_insert on reminder_prefs
  for insert with check (university_id in (select my_university_ids()));

-- ── Effective offsets precedence: task override → university pref → global ────
-- Rewrite generate_reminder_jobs to honor per-university prefs + auto toggle.
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
    set fire_at = excluded.fire_at
    where reminder_jobs.status = 'pending';

  delete from reminder_jobs r
  where r.task_id = p_task_id
    and r.status = 'pending'
    and r.offset_min <> 0
    and (
      r.offset_min <> all (offsets)
      or r.boa_id not in (select boa_id from eligible_boas_for_task(t))
    );
end $$;

-- ── Manual "send now" — enqueue an immediate reminder (offset 0) ─────────────
-- Authorized for admins or staff assigned to the task's university. The cron
-- drainer / edge function then delivers it on the next tick (or instantly once
-- WhatsApp is connected). Returns number of BOAs queued.
create or replace function public.enqueue_manual_reminder(p_task_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  t tasks;
  n int;
begin
  select * into t from tasks where id = p_task_id;
  if not found then raise exception 'task not found'; end if;
  if not (is_admin() or t.university_id in (select my_university_ids())) then
    raise exception 'not authorized';
  end if;

  insert into reminder_jobs (task_id, boa_id, offset_min, fire_at, status)
  select p_task_id, e.boa_id, 0, now(), 'pending'
  from eligible_boas_for_task(t) e
  on conflict (task_id, boa_id, offset_min) do update
    set status = 'pending', fire_at = now(), claimed_at = null, attempts = 0, error = null;

  get diagnostics n = row_count;
  return n;
end $$;

-- keep prefs updated_at fresh
create trigger reminder_prefs_touch
  before update on reminder_prefs
  for each row execute function set_updated_at();

-- regenerate jobs when a university's prefs change (offsets/auto toggle)
create or replace function public.reminder_prefs_apply()
returns trigger language plpgsql as $$
begin
  perform generate_reminder_jobs(t.id)
  from tasks t
  where t.university_id = new.university_id
    and t.execution_status in ('pending', 'in_progress')
    and t.publish_at is not null
    and t.publish_at > now();
  return new;
end $$;

create trigger reminder_prefs_apply_trg
  after insert or update of offsets_min, auto_enabled on reminder_prefs
  for each row execute function reminder_prefs_apply();
