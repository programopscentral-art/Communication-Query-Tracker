-- ============================================================================
-- 0036_event_batches.sql — events can target one or more student batches.
--
--  • events.batches (text[]): the batches an event targets. ['All'] = every
--    batch, including future ones. NULL = not specified ("—"). Values come from
--    the shared ref_batch list (0035) — no new list. NOT part of the event's
--    identity (sheet_key / fingerprint / soft match are unchanged).
--  • events_guard: batches are an event DETAIL — staff can't change them; full
--    admins and the sheet sync (service role) can. Identical to 0033 except
--    `batches` is added to the details check (marked below).
-- Adding the column changes no existing row (it starts NULL for every event):
-- no trigger fires, no updated_at / History change.
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0036.sql
-- ============================================================================

alter table events add column if not exists batches text[];

create or replace function public.events_guard()
returns trigger language plpgsql as $$
declare
  is_staff boolean := current_user in ('authenticated', 'anon') and not is_admin();
  details_changed boolean;
  report_changed  boolean;
begin
  details_changed := (new.period, new.event_date, new.event_end_date, new.event_date_text, new.university_id,
      new.university_raw, new.conducted_by, new.cma_assigned, new.category, new.subcategory, new.title,
      new.coverage, new.duration, new.mode, new.zoho_status, new.admin_comments,
      new.batches)   -- NEW (0036)
    is distinct from (old.period, old.event_date, old.event_end_date, old.event_date_text, old.university_id,
      old.university_raw, old.conducted_by, old.cma_assigned, old.category, old.subcategory, old.title,
      old.coverage, old.duration, old.mode, old.zoho_status, old.admin_comments,
      old.batches);  -- NEW (0036)
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

  -- (0033) the description is written by the Student Engagement team; staff see it read-only.
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
