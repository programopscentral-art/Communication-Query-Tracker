-- ============================================================================
-- 0039_rls_initplan.sql — make the access rules (RLS) fast; WHO can see or
-- change WHAT is unchanged.
--
-- 59 of the 69 public policies called is_admin(), has_admin_read(),
-- current_boa_id() or auth.uid() directly, so Postgres ran the function once
-- for EVERY ROW it checked (e.g. 14,500 times for one Reminders log page:
-- ~550 ms). Wrapping each call as (select is_admin()) lets Postgres run it
-- ONCE per query (an "initPlan") and reuse the answer: same result, ~25 ms.
-- (Supabase's documented RLS performance advice.)
--
-- Only the USING / WITH CHECK text changes, and only by that wrapping. Policy
-- names, commands (SELECT/ALL/…), roles and permissive/restrictive stay as they
-- are. The 10 policies that only use "IN (SELECT my_university_ids())" are
-- already evaluated once per query and are not touched.
-- Tables: admin_emails, announcements, app_settings, app_users, audit_log, boas, escalation_contacts, event_nudges, events, internal_messages, ref_batch, ref_category, ref_channel, ref_content_type, ref_priority, ref_target_audience, ref_team, ref_update_type, reminder_jobs, reminder_prefs, task_sheet_state, tasks, teams_cards, tickets, universities, university_boas, university_teams.
-- Changes no row; no trigger fires.
-- Generated from the live policy text (snapshot-0039-before.json).
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0039.sql
-- ============================================================================

alter policy "admin_emails_admin" on public."admin_emails"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "admin_emails_viewer_read" on public."admin_emails"
  using ((select has_admin_read()));

alter policy "ann_admin_all" on public."announcements"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "announcements_viewer_read" on public."announcements"
  using ((select has_admin_read()));

alter policy "settings_admin_write" on public."app_settings"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "settings_read" on public."app_settings"
  using (((select auth.uid()) IS NOT NULL));

alter policy "app_users_admin_write" on public."app_users"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "app_users_self_read" on public."app_users"
  using (((id = (select auth.uid())) OR (select is_admin())));

alter policy "app_users_viewer_read" on public."app_users"
  using ((select has_admin_read()));

alter policy "audit_admin_read" on public."audit_log"
  using ((select is_admin()));

alter policy "audit_log_viewer_read" on public."audit_log"
  using ((select has_admin_read()));

alter policy "boas_admin_all" on public."boas"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "boas_self_read" on public."boas"
  using ((id = (select current_boa_id())));

alter policy "boas_viewer_read" on public."boas"
  using ((select has_admin_read()));

alter policy "esc_admin_all" on public."escalation_contacts"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "escalation_contacts_viewer_read" on public."escalation_contacts"
  using ((select has_admin_read()));

alter policy "event_nudges_admin_all" on public."event_nudges"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "event_nudges_read" on public."event_nudges"
  using (((select has_admin_read()) OR (boa_id = (select current_boa_id()))));

alter policy "events_admin_all" on public."events"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "events_read" on public."events"
  using (((select has_admin_read()) OR (university_id IN ( SELECT my_university_ids() AS my_university_ids))));

alter policy "im_admin_all" on public."internal_messages"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "internal_messages_viewer_read" on public."internal_messages"
  using ((select has_admin_read()));

alter policy "ref_batch_admin" on public."ref_batch"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_batch_read" on public."ref_batch"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ref_category_admin" on public."ref_category"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_category_read" on public."ref_category"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ref_channel_admin" on public."ref_channel"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_channel_read" on public."ref_channel"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ref_content_type_admin" on public."ref_content_type"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_content_type_read" on public."ref_content_type"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ref_priority_admin" on public."ref_priority"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_priority_read" on public."ref_priority"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ref_target_audience_admin" on public."ref_target_audience"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_target_audience_read" on public."ref_target_audience"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ref_team_admin" on public."ref_team"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_team_read" on public."ref_team"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ref_update_type_admin" on public."ref_update_type"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ref_update_type_read" on public."ref_update_type"
  using (((select auth.uid()) IS NOT NULL));

alter policy "reminder_jobs_viewer_read" on public."reminder_jobs"
  using ((select has_admin_read()));

alter policy "rj_admin_all" on public."reminder_jobs"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "rj_boa_read" on public."reminder_jobs"
  using ((boa_id = (select current_boa_id())));

alter policy "reminder_prefs_viewer_read" on public."reminder_prefs"
  using ((select has_admin_read()));

alter policy "rp_admin_all" on public."reminder_prefs"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "task_sheet_state_admin" on public."task_sheet_state"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "task_sheet_state_viewer_read" on public."task_sheet_state"
  using ((select has_admin_read()));

alter policy "tasks_admin_all" on public."tasks"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "tasks_viewer_read" on public."tasks"
  using ((select has_admin_read()));

alter policy "teams_cards_read" on public."teams_cards"
  using ((select has_admin_read()));

alter policy "tickets_admin_all" on public."tickets"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "tickets_staff_insert" on public."tickets"
  with check (((university_id IN ( SELECT my_university_ids() AS my_university_ids)) AND (raised_by = (select auth.uid()))));

alter policy "tickets_staff_update_own" on public."tickets"
  using ((raised_by = (select auth.uid())))
  with check ((raised_by = (select auth.uid())));

alter policy "tickets_viewer_read" on public."tickets"
  using ((select has_admin_read()));

alter policy "universities_admin_write" on public."universities"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "universities_read" on public."universities"
  using (((select auth.uid()) IS NOT NULL));

alter policy "ub_admin_all" on public."university_boas"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "ub_self_read" on public."university_boas"
  using ((boa_id = (select current_boa_id())));

alter policy "university_boas_viewer_read" on public."university_boas"
  using ((select has_admin_read()));

alter policy "university_teams_admin_write" on public."university_teams"
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy "university_teams_read" on public."university_teams"
  using ((select has_admin_read()));
