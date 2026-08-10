-- ============================================================================
-- 0012_staff_directory.sql
--   • store email on app_users (for the Admin Access tab)
--   • let staff read co-workers within their own university (team view)
--   • sheet row-refs on boas ("View in Sheet" for the staff sheet)
-- ============================================================================

alter table app_users add column if not exists email text;

-- Provision email on signup + keep role/boa link (supersedes 0002's function body).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_domain text;
  v_email  text := lower(new.email);
  v_role   user_role;
  v_boa_id uuid;
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

  insert into app_users (id, role, boa_id, full_name, email)
  values (new.id, v_role, v_boa_id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), v_email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- Backfill emails for anyone who already signed in.
update app_users a set email = lower(u.email)
from auth.users u where u.id = a.id and a.email is null;

-- Sheet row-refs for the staff sheet
alter table boas add column if not exists source_row int;
alter table boas add column if not exists source_gid text;

-- ── Staff may read co-workers within their own university (team directory) ──
create policy boas_same_uni_read on boas
  for select using (
    id in (select boa_id from university_boas where university_id in (select my_university_ids()))
  );

create policy ub_same_uni_read on university_boas
  for select using (university_id in (select my_university_ids()));
