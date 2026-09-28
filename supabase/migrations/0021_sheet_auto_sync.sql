-- ============================================================================
-- 0021_sheet_auto_sync.sql — groundwork for automatic Sheet → app sync.
--
--  • task_sheet_state: the last value the SHEET showed for each row's outcome
--    fields (status / actual publish date / issue). The sync applies a sheet
--    value only when the sheet itself changed since the last run, so a BOA's
--    in-app update isn't reverted every few minutes. Kept in its own table so
--    maintaining it never writes to tasks (no updated_at bump, no audit rows,
--    no reminder regeneration).
--  • existing_task_sync_state(): also returns those last-seen values, and may
--    be called by the service role (the scheduled job has no signed-in user).
--  • app_settings: last sync status, shown on the Source tab.
-- ============================================================================

create table if not exists task_sheet_state (
  source_key text primary key references tasks(source_key) on delete cascade,
  status     text,
  actual     timestamptz,
  issue      text,
  seen_at    timestamptz not null default now()
);
alter table task_sheet_state enable row level security;
drop policy if exists task_sheet_state_admin on task_sheet_state;
create policy task_sheet_state_admin on task_sheet_state
  for all using (is_admin()) with check (is_admin());

-- Backfill: on 2026-09-28 every sheet row's outcome in the app was verified
-- identical to the sheet, so current values are exactly what the sheet showed.
insert into task_sheet_state (source_key, status, actual, issue)
select source_key, execution_status::text, actual_publish_date, issue_blocker
from tasks
where origin = 'sheet' and source_key is not null
on conflict (source_key) do nothing;

create or replace function public.existing_task_sync_state()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized';
  end if;
  return coalesce((
    select jsonb_object_agg(t.source_key, jsonb_build_object(
      'o',    t.origin,
      's',    t.execution_status,
      'a',    t.actual_publish_date,
      'i',    t.issue_blocker,
      'seen', ss.source_key is not null,
      'ss',   ss.status,
      'sa',   ss.actual,
      'si',   ss.issue))
    from tasks t
    left join task_sheet_state ss on ss.source_key = t.source_key
    where t.source_key is not null
  ), '{}'::jsonb);
end $$;

alter table app_settings add column if not exists last_sheet_sync_at      timestamptz;
alter table app_settings add column if not exists last_sheet_sync_ok      boolean;
alter table app_settings add column if not exists last_sheet_sync_message text;
alter table app_settings add column if not exists last_sheet_sync_source  text;
