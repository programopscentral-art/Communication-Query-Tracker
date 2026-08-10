-- ============================================================================
-- 0003_rls.sql — Row Level Security
-- BOA sees only their assigned university's data; Admin sees all;
-- internal_messages is admin-only. Enforced at the data layer, not the UI.
-- ============================================================================

-- ── Helper functions (SECURITY DEFINER → bypass RLS to avoid recursion) ──────
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from app_users where id = auth.uid()), false)
$$;

create or replace function public.current_boa_id()
returns uuid language sql stable security definer set search_path = public as $$
  select boa_id from app_users where id = auth.uid()
$$;

-- Universities the current user (as a BOA) is actively assigned to.
create or replace function public.my_university_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ub.university_id
  from university_boas ub
  join app_users au on au.boa_id = ub.boa_id
  where au.id = auth.uid()
    and (ub.effective_from is null or ub.effective_from <= current_date)
    and (ub.effective_to   is null or ub.effective_to   >= current_date)
$$;

-- ── Enable RLS everywhere ────────────────────────────────────────────────────
alter table universities        enable row level security;
alter table boas                enable row level security;
alter table university_boas     enable row level security;
alter table escalation_contacts enable row level security;
alter table app_users           enable row level security;
alter table tasks               enable row level security;
alter table reminder_jobs       enable row level security;
alter table internal_messages   enable row level security;
alter table audit_log           enable row level security;
alter table app_settings        enable row level security;
alter table admin_emails        enable row level security;
alter table ref_team            enable row level security;
alter table ref_update_type     enable row level security;
alter table ref_category        enable row level security;
alter table ref_channel         enable row level security;
alter table ref_content_type    enable row level security;

-- ── app_users: read own row; admins read all; admins manage ──────────────────
create policy app_users_self_read on app_users
  for select using (id = auth.uid() or is_admin());
create policy app_users_admin_write on app_users
  for all using (is_admin()) with check (is_admin());

-- ── universities: everyone signed-in can read; admins write ──────────────────
create policy universities_read on universities
  for select using (auth.uid() is not null);
create policy universities_admin_write on universities
  for all using (is_admin()) with check (is_admin());

-- ── boas: admins all; a BOA can read their own record ────────────────────────
create policy boas_admin_all on boas
  for all using (is_admin()) with check (is_admin());
create policy boas_self_read on boas
  for select using (id = current_boa_id());

-- ── university_boas / escalation_contacts: admins manage; BOA reads own ───────
create policy ub_admin_all on university_boas
  for all using (is_admin()) with check (is_admin());
create policy ub_self_read on university_boas
  for select using (boa_id = current_boa_id());

create policy esc_admin_all on escalation_contacts
  for all using (is_admin()) with check (is_admin());

-- ── tasks: admins all; BOA reads + updates tasks for their universities ──────
create policy tasks_admin_all on tasks
  for all using (is_admin()) with check (is_admin());
create policy tasks_boa_read on tasks
  for select using (university_id in (select my_university_ids()));
-- BOA may update execution progress fields on their universities' tasks.
create policy tasks_boa_update on tasks
  for update using (university_id in (select my_university_ids()))
  with check (university_id in (select my_university_ids()));

-- ── reminder_jobs: admins all; BOA reads own pings ───────────────────────────
create policy rj_admin_all on reminder_jobs
  for all using (is_admin()) with check (is_admin());
create policy rj_boa_read on reminder_jobs
  for select using (boa_id = current_boa_id());

-- ── internal_messages: ADMIN ONLY (read + write) ─────────────────────────────
create policy im_admin_all on internal_messages
  for all using (is_admin()) with check (is_admin());

-- ── audit_log: admin read ────────────────────────────────────────────────────
create policy audit_admin_read on audit_log
  for select using (is_admin());

-- ── settings / admin_emails: read signed-in, write admin ─────────────────────
create policy settings_read on app_settings
  for select using (auth.uid() is not null);
create policy settings_admin_write on app_settings
  for all using (is_admin()) with check (is_admin());
create policy admin_emails_admin on admin_emails
  for all using (is_admin()) with check (is_admin());

-- ── reference tables: read signed-in, write admin ────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['ref_team','ref_update_type','ref_category','ref_channel','ref_content_type']
  loop
    execute format('create policy %I_read on %I for select using (auth.uid() is not null);', t, t);
    execute format('create policy %I_admin on %I for all using (is_admin()) with check (is_admin());', t, t);
  end loop;
end $$;

-- NOTE: the service_role key (sync + edge functions) bypasses RLS entirely,
-- so background jobs are unaffected by these policies.
