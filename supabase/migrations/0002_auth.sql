-- ============================================================================
-- 0002_auth.sql — domain lock + auto-provisioning of app_users
-- The HARD enforcement layer: even if the OAuth hint and middleware were
-- bypassed, a non-@nxtwave.co.in user can never be created here.
-- ============================================================================

-- Configurable allowed domain (single source of truth in the DB).
alter table app_settings
  add column if not exists allowed_domain text not null default 'nxtwave.co.in';

-- Emails that should be provisioned as admins (everyone else defaults to 'boa').
create table if not exists admin_emails (
  email text primary key
);

-- Runs when GoTrue inserts a new auth user (first Google sign-in).
--   1. Rejects any email outside the allowed domain (rolls back the signup).
--   2. Inserts the matching public.app_users row with the right role, linking to
--      a boas record when the email matches (so BOAs are scoped immediately).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain   text;
  v_email    text := lower(new.email);
  v_role     user_role;
  v_boa_id   uuid;
begin
  select allowed_domain into v_domain from app_settings where id = 1;

  if v_email is null or v_email !~ ('@' || replace(v_domain, '.', '\.') || '$') then
    raise exception 'Access denied: only @% accounts are allowed', v_domain
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from admin_emails where lower(email) = v_email) then
    v_role := 'admin';
  else
    v_role := 'boa';
  end if;

  select id into v_boa_id from boas where lower(email) = v_email limit 1;

  insert into app_users (id, role, boa_id, full_name)
  values (
    new.id,
    v_role,
    v_boa_id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
