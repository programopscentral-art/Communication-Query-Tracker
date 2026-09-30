-- ============================================================================
-- 0028_event_nudges.sql — reminders for pending event reports + Zoho export support.
--
--  • events.event_last_day: the event's last day (end date for multi-day events)
--    — a report is DUE `event_nudge_after_days` after it, and ESCALATED
--    `event_escalate_after_days` after it, while report_filled < 7.
--  • event_nudges: one row per (event, stage, staff member). The unique key makes
--    duplicate reminders impossible however often / concurrently the job runs.
--    WhatsApp delivery drains 'queued' rows once WhatsApp is live.
--  • v_event_overdue: overdue counts per university/month (IST, grace from settings).
-- ============================================================================

alter table events add column if not exists event_last_day date
  generated always as (coalesce(event_end_date, event_date)) stored;
create index if not exists events_open_lastday_idx on events (event_last_day) where report_filled < 7;

alter table app_settings add column if not exists event_nudge_enabled       boolean not null default true;
alter table app_settings add column if not exists event_nudge_after_days    int     not null default 2;
alter table app_settings add column if not exists event_escalate_after_days int     not null default 7;
alter table app_settings add column if not exists event_nudge_lookback_days int     not null default 45;
alter table app_settings add column if not exists last_event_nudge_at       timestamptz;
alter table app_settings add column if not exists last_event_nudge_ok       boolean;
alter table app_settings add column if not exists last_event_nudge_message  text;
alter table app_settings add column if not exists last_event_nudge_source   text;
alter table app_settings drop constraint if exists app_settings_event_nudge_days_check;
alter table app_settings add constraint app_settings_event_nudge_days_check check (
  event_nudge_after_days between 0 and 60
  and event_escalate_after_days between 1 and 120
  and event_escalate_after_days > event_nudge_after_days
  and event_nudge_lookback_days between 7 and 365
);

create table if not exists event_nudges (
  id            bigint generated always as identity primary key,
  event_id      uuid not null references events(id) on delete cascade,
  boa_id        uuid not null references boas(id) on delete cascade,
  stage         text not null check (stage in ('due', 'overdue')),
  channel       text not null default 'whatsapp',
  status        text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  whatsapp_e164 text,
  message       text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  error         text,
  unique (event_id, stage, boa_id)
);
create index if not exists event_nudges_created_idx on event_nudges (created_at desc);
create index if not exists event_nudges_queued_idx  on event_nudges (created_at) where status = 'queued';

alter table event_nudges enable row level security;
drop policy if exists event_nudges_admin_all on event_nudges;
create policy event_nudges_admin_all on event_nudges for all using (is_admin()) with check (is_admin());
drop policy if exists event_nudges_read on event_nudges;
create policy event_nudges_read on event_nudges
  for select using (has_admin_read() or boa_id = current_boa_id());

-- Overdue reports per university / month (IST "today", grace days from settings).
create or replace view v_event_overdue with (security_invoker = on) as
select e.university_id, e.period, count(*)::int as overdue
from events e
cross join app_settings s
where s.id = 1
  and e.report_filled < 7
  and e.event_last_day is not null
  and e.sheet_missing_since is null
  and e.event_last_day <= (now() at time zone 'Asia/Kolkata')::date - s.event_nudge_after_days
group by e.university_id, e.period;
