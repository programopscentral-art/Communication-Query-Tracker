-- ============================================================================
-- 0031_reminder_triggers_definer.sql — staff could not update their own tasks.
--
-- Bug: a task UPDATE by university staff (status → in progress, publish time,
-- saving reminder timing) fires the reminder triggers, which ran with the
-- STAFF member's rights. Staff may only *read* reminder_jobs, so regenerating
-- the jobs failed with "new row violates row-level security policy for table
-- reminder_jobs" and the whole update was rejected (and "published" silently
-- failed to cancel pending reminders). Admins were unaffected (they can write
-- reminder_jobs), and no staff member had signed in yet, so it never surfaced.
--
-- Fix: the reminder machinery runs as the table owner (SECURITY DEFINER). Who
-- may change the task/prefs is still decided by RLS on tasks/reminder_prefs;
-- the regeneration itself is deterministic, so nothing is widened. The helper
-- functions are no longer callable directly through the API.
-- ============================================================================

alter function public.generate_reminder_jobs(uuid)          security definer set search_path = public;
alter function public.regen_reminders_for_university(uuid)  security definer set search_path = public;
alter function public.tasks_reminder_sync()                 security definer set search_path = public;
alter function public.reminder_prefs_apply()                security definer set search_path = public;
alter function public.university_boas_regen()               security definer set search_path = public;
alter function public.boas_regen()                          security definer set search_path = public;

revoke execute on function public.generate_reminder_jobs(uuid)         from public, anon, authenticated;
revoke execute on function public.regen_reminders_for_university(uuid) from public, anon, authenticated;
grant  execute on function public.generate_reminder_jobs(uuid)         to service_role;
grant  execute on function public.regen_reminders_for_university(uuid) to service_role;
