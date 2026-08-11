-- ============================================================================
-- 0016_reminder_view_fire_at.sql — expose fire_at / sent_at / boa_id on the
-- reminder details view so the UI can sort + window reminders by when they fire.
-- ============================================================================

drop view if exists reminder_job_details;

create view reminder_job_details as
  select r.id as job_id, r.boa_id, r.offset_min, r.attempts, r.status,
         r.fire_at, r.sent_at,
         b.whatsapp_e164, b.name as boa_name, b.preferred_language,
         u.name as university_name, u.code as university_code, u.timezone,
         t.id as task_id, t.team, t.update_type, t.category, t.priority,
         t.channel, t.content_type, t.target_audience, t.message_content,
         t.poster_drive_link, t.publish_at, t.special_instructions, t.execution_status
  from reminder_jobs r
  join boas b on b.id = r.boa_id
  join tasks t on t.id = r.task_id
  join universities u on u.id = t.university_id;

-- caller's RLS applies (BOA sees only their pings; admin sees all)
alter view reminder_job_details set (security_invoker = on);
