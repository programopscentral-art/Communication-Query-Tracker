-- ============================================================================
-- 0038_reminder_view_invoker.sql — close a leak in the Reminders log view.
--
-- reminder_job_details was the only view WITHOUT security_invoker, so it ran
-- with its owner's rights (postgres) and skipped row-level security. It was
-- also granted to anon. Result: anyone with the PUBLIC anon key (no login)
-- could read every reminder — staff names, WhatsApp numbers, post text.
-- Verified 2026-11-25: 14,500 rows returned to the anon key.
--
--  • security_invoker = on → the reader's own RLS applies (as for every other view):
--      full admins + read-only admins → every reminder (unchanged);
--      university staff → only their OWN reminders (the page says "for you");
--      not signed in → nothing.
--  • anon: no access at all. authenticated: SELECT only. service_role (the
--    WhatsApp/Teams senders) keeps full access and bypasses RLS as before.
--
-- ⚠️ Any later CREATE OR REPLACE of this view must keep security_invoker on
--    (write `create or replace view ... with (security_invoker = on) as`).
-- Changes no row. Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0038.sql
-- ============================================================================

alter view public.reminder_job_details set (security_invoker = on);

revoke all on public.reminder_job_details from anon;
revoke all on public.reminder_job_details from authenticated;
grant select on public.reminder_job_details to authenticated;
grant all on public.reminder_job_details to service_role;
