-- ============================================================================
-- 0015_autolink_boa.sql — keep app_users.boa_id linked to the matching staff
-- record no matter the order of operations (account first, or staff first).
-- Fixes: a person added to staff AFTER their account already existed was never
-- linked, so they saw "No university assigned".
-- ============================================================================

-- When a staff record gets an email (insert or email change), link any existing
-- account with the same email that isn't linked yet.
create or replace function public.link_boa_to_app_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null then
    update app_users
      set boa_id = new.id
      where boa_id is null and lower(email) = lower(new.email);
  end if;
  return new;
end $$;

drop trigger if exists boas_link_app_user on boas;
create trigger boas_link_app_user
  after insert or update of email on boas
  for each row execute function link_boa_to_app_user();

-- One-time backfill for accounts already stranded (e.g. perisetti.sunil).
update app_users a
  set boa_id = b.id
  from boas b
  where a.boa_id is null
    and a.email is not null
    and lower(a.email) = lower(b.email);
