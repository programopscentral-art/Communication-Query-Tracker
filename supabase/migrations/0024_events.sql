-- ============================================================================
-- 0024_events.sql — Event Reports.
--
-- One row per event. Two groups of columns:
--   • Event details  — filled by the Student Engagement team (full admins):
--       date, campus, conducted by, CMA, category, subcategory, title,
--       coverage, duration, mode (+ Loaded-to-Zoho and reviewer comments).
--   • Event report   — filled by that university's staff:
--       description, registrations, participants, feedback rate, rating,
--       feedback, highlights, improvements, photo / form / recording links.
--
-- Sources: the Event Reports Google Sheet (read-only, all monthly tabs) AND the
-- app. The sync (web/src/lib/eventSync.ts) uses a per-field three-way merge
-- (sheet_seen) so an edit made in the app isn't reverted unless the sheet
-- changes that same field. Rows removed from the sheet are flagged, never
-- deleted automatically.
--
-- Security: staff can SELECT/UPDATE only their universities' events, and the
-- events_guard trigger lets them change ONLY the report columns.
-- ============================================================================

create table if not exists events (
  id                  uuid primary key default gen_random_uuid(),
  -- provenance
  origin              text not null default 'ui' check (origin in ('sheet', 'ui')),
  sheet_key           text unique,          -- the sheet's "Unique Key" (only when unique in the sheet)
  fingerprint         text unique,          -- identity from the SHEET's values (eventSync.ts)
  source_tab          text,
  source_gid          text,
  source_row          int,
  sheet_seen          jsonb,                -- last value the sheet showed, per field
  sheet_missing_since timestamptz,          -- was in the sheet, isn't any more
  -- when
  period              date not null,        -- month bucket (1st of month), from the tab
  event_date          date,
  event_end_date      date,
  event_date_text     text,                 -- as written in the sheet
  -- event details (Student Engagement team)
  university_id       uuid references universities(id) on delete set null,
  university_raw      text,
  conducted_by        text,
  cma_assigned        text,
  category            text,
  subcategory         text,
  title               text not null,
  coverage            text,
  duration            text,
  mode                text,
  zoho_status         text,                 -- "Loaded to Zoho" (CRM team)
  admin_comments      text,                 -- reviewer notes ("Comments")
  -- event report (university staff)
  description             text,
  registrations           text,
  participants            text,
  feedback_rate           text,
  avg_rating              text,
  feedback                text,
  highlights              text,
  improvements            text,
  photos_link             text,
  registration_form_link  text,
  feedback_form_link      text,
  recording_link          text,
  -- how many of the 7 core report fields are filled (0–7) → report status
  report_filled smallint generated always as (
    ( (case when nullif(btrim(description), '')   is null then 0 else 1 end)
    + (case when nullif(btrim(registrations), '') is null then 0 else 1 end)
    + (case when nullif(btrim(participants), '')  is null then 0 else 1 end)
    + (case when nullif(btrim(feedback), '')      is null then 0 else 1 end)
    + (case when nullif(btrim(highlights), '')    is null then 0 else 1 end)
    + (case when nullif(btrim(improvements), '')  is null then 0 else 1 end)
    + (case when nullif(btrim(photos_link), '')   is null then 0 else 1 end) )::smallint
  ) stored,
  -- bookkeeping
  created_at          timestamptz not null default now(),
  created_by          uuid references app_users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references app_users(id) on delete set null,
  report_updated_at   timestamptz,
  report_updated_by   uuid references app_users(id) on delete set null
);

create index if not exists events_period_uni_idx on events (period, university_id);
create index if not exists events_uni_period_idx on events (university_id, period);
create index if not exists events_date_idx       on events (event_date);
create index if not exists events_missing_idx    on events (sheet_missing_since) where sheet_missing_since is not null;

-- ── Guard: staff may change ONLY the report columns ─────────────────────────
-- Also stamps updated_at / report_updated_at only when a real field changes
-- (the sync's bookkeeping columns — sheet_seen etc. — don't count).
create or replace function public.events_guard()
returns trigger language plpgsql as $$
declare
  is_staff boolean := current_user in ('authenticated', 'anon') and not is_admin();
  details_changed boolean;
  report_changed  boolean;
begin
  details_changed := (new.period, new.event_date, new.event_end_date, new.event_date_text, new.university_id,
      new.university_raw, new.conducted_by, new.cma_assigned, new.category, new.subcategory, new.title,
      new.coverage, new.duration, new.mode, new.zoho_status, new.admin_comments)
    is distinct from (old.period, old.event_date, old.event_end_date, old.event_date_text, old.university_id,
      old.university_raw, old.conducted_by, old.cma_assigned, old.category, old.subcategory, old.title,
      old.coverage, old.duration, old.mode, old.zoho_status, old.admin_comments);
  report_changed := (new.description, new.registrations, new.participants, new.feedback_rate, new.avg_rating,
      new.feedback, new.highlights, new.improvements, new.photos_link, new.registration_form_link,
      new.feedback_form_link, new.recording_link)
    is distinct from (old.description, old.registrations, old.participants, old.feedback_rate, old.avg_rating,
      old.feedback, old.highlights, old.improvements, old.photos_link, old.registration_form_link,
      old.feedback_form_link, old.recording_link);

  if is_staff and (details_changed
      or (new.origin, new.sheet_key, new.fingerprint, new.source_tab, new.source_gid, new.source_row,
          new.sheet_seen, new.sheet_missing_since, new.created_at, new.created_by)
         is distinct from
         (old.origin, old.sheet_key, old.fingerprint, old.source_tab, old.source_gid, old.source_row,
          old.sheet_seen, old.sheet_missing_since, old.created_at, old.created_by)) then
    raise exception 'Only the Student Engagement team can change event details. You can update the report fields.'
      using errcode = 'insufficient_privilege';
  end if;

  if report_changed then
    new.report_updated_at := now();
    new.report_updated_by := auth.uid();   -- null when written by the sheet sync
  end if;
  if report_changed or details_changed then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists events_guard_trg on events;
create trigger events_guard_trg before update on events
  for each row execute function events_guard();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table events enable row level security;
drop policy if exists events_admin_all on events;
create policy events_admin_all on events
  for all using (is_admin()) with check (is_admin());
drop policy if exists events_read on events;
create policy events_read on events
  for select using (has_admin_read() or university_id in (select my_university_ids()));
drop policy if exists events_staff_update on events;
create policy events_staff_update on events
  for update using (university_id in (select my_university_ids()))
  with check (university_id in (select my_university_ids()));

-- ── Settings: which sheet + last sync status ─────────────────────────────────
alter table app_settings add column if not exists events_sheet_id text
  not null default '1yFsv37DB3xevKH2Mw2nuTqCgL45HKbyspNkM1o-CAxw';
alter table app_settings add column if not exists last_event_sync_at      timestamptz;
alter table app_settings add column if not exists last_event_sync_ok      boolean;
alter table app_settings add column if not exists last_event_sync_message text;
alter table app_settings add column if not exists last_event_sync_source  text;

-- ── Campus names used in the events sheet ────────────────────────────────────
-- Spelling variants of existing universities. CIET is mapped to Chalapathy by
-- elimination (it's the only campus without a match, and Chalapathy is the only
-- university missing from the sheet) — change it on /admin/events if wrong.
update universities set aliases = array_append(aliases, 'Takshashila')
  where code = 'takshasila' and not ('Takshashila' = any(coalesce(aliases, '{}')));
update universities set aliases = array_append(aliases, 'Chevella')
  where code = 'niat-chevella' and not ('Chevella' = any(coalesce(aliases, '{}')));
update universities set aliases = array_append(aliases, 'BITs Chevella')
  where code = 'niat-chevella' and not ('BITs Chevella' = any(coalesce(aliases, '{}')));
update universities set aliases = array_append(aliases, 'CIET')
  where code = 'chalapathy' and not ('CIET' = any(coalesce(aliases, '{}')));
