-- ============================================================================
-- 0023_read_only_admin.sql — "Read-only admin": sees everything a full admin
-- sees, but can't create / update / delete anything.
--
--  • A read-only admin is an app_user with can_view_admin = true (role stays
--    'boa' — so if they are also university staff they keep their own-board
--    powers). Full admins are role = 'admin'.
--  • has_admin_read(): full admin OR read-only admin. Every admin-visible table
--    gets an extra SELECT policy on it. Write policies are unchanged — they
--    still require is_admin() (full admin), so the DB itself refuses a
--    read-only admin's writes.
--  • admin_emails.level: invite someone as 'admin' or 'viewer'; first sign-in
--    applies the level.
-- ============================================================================

create or replace function public.has_admin_read()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' or can_view_admin from app_users where id = auth.uid()), false)
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'admin_emails', 'announcements', 'app_users', 'audit_log', 'boas',
    'escalation_contacts', 'internal_messages', 'reminder_jobs', 'reminder_prefs',
    'task_sheet_state', 'tasks', 'tickets', 'university_boas'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_viewer_read', t);
    execute format('create policy %I on public.%I for select using (has_admin_read())', t || '_viewer_read', t);
  end loop;
end $$;

-- Invite level: 'admin' (full) or 'viewer' (read-only).
alter table admin_emails add column if not exists level text not null default 'admin';
alter table admin_emails drop constraint if exists admin_emails_level_check;
alter table admin_emails add constraint admin_emails_level_check check (level in ('admin', 'viewer'));

-- First sign-in honours the invite level (supersedes 0012's body).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_domain text;
  v_email  text := lower(new.email);
  v_level  text;
  v_boa_id uuid;
begin
  select allowed_domain into v_domain from app_settings where id = 1;
  if v_email is null or v_email !~ ('@' || replace(v_domain, '.', '\.') || '$') then
    raise exception 'Access denied: only @% accounts are allowed', v_domain
      using errcode = 'insufficient_privilege';
  end if;

  select level into v_level from admin_emails where lower(email) = v_email;
  select id into v_boa_id from boas where lower(email) = v_email limit 1;

  insert into app_users (id, role, boa_id, full_name, email, can_view_admin)
  values (
    new.id,
    case when v_level = 'admin' then 'admin'::user_role else 'boa'::user_role end,
    v_boa_id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    v_email,
    coalesce(v_level = 'viewer', false)
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
