-- ============================================================================
-- 0033_event_description_admin.sql — the event description belongs to the admin.
--
--  • Admins write the description when creating an event (and can edit it on the
--    event page). University staff see it read-only.
--  • events_guard: staff can no longer change `description`. Full admins and the
--    sheet sync (service role) can, exactly as before. Everything else unchanged.
--  • A report is "complete" with 6 key fields (registrations, participants,
--    feedback, highlights, improvements, photos) — the description no longer
--    counts, so staff aren't stuck when it's blank. report_filled is recomputed
--    for every event (no row is "updated", so no trigger / History entry fires).
--  • The two summary views and the open-reports index use the new threshold (6).
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0033.sql
-- ============================================================================

-- ── 1) report_filled = 6 key fields ──────────────────────────────────────────
-- The views/index that read report_filled are dropped and recreated around the change.
drop view  if exists v_event_month_stats;
drop view  if exists v_event_overdue;
drop index if exists events_open_lastday_idx;

alter table events alter column report_filled set expression as (
  ( (case when nullif(btrim(registrations), '') is null then 0 else 1 end)
  + (case when nullif(btrim(participants), '')  is null then 0 else 1 end)
  + (case when nullif(btrim(feedback), '')      is null then 0 else 1 end)
  + (case when nullif(btrim(highlights), '')    is null then 0 else 1 end)
  + (case when nullif(btrim(improvements), '')  is null then 0 else 1 end)
  + (case when nullif(btrim(photos_link), '')   is null then 0 else 1 end) )::smallint
);

create view v_event_month_stats with (security_invoker = on) as
select period, university_id,
       count(*)::int                                              as total,
       count(*) filter (where report_filled >= 6)::int            as complete,
       count(*) filter (where report_filled between 1 and 5)::int as partial,
       count(*) filter (where report_filled = 0)::int             as pending,
       count(*) filter (where sheet_missing_since is not null)::int as missing
from events
group by period, university_id;

create view v_event_overdue with (security_invoker = on) as
select e.university_id, e.period, count(*)::int as overdue
from events e
cross join app_settings s
where s.id = 1
  and e.report_filled < 6
  and e.event_last_day is not null
  and e.sheet_missing_since is null
  and e.event_last_day <= (now() at time zone 'Asia/Kolkata')::date - s.event_nudge_after_days
group by e.university_id, e.period;

-- Same permissions the views had before (Supabase defaults).
grant all on v_event_month_stats, v_event_overdue to anon, authenticated, service_role;

create index events_open_lastday_idx on events (event_last_day) where report_filled < 6;

-- ── 2) Guard: staff may not change the description ───────────────────────────
-- Identical to 0024 except the one new check marked below.
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

  -- NEW (0033): the description is written by the Student Engagement team; staff see it read-only.
  if is_staff and new.description is distinct from old.description then
    raise exception 'Only the Student Engagement team can change the event description.'
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
