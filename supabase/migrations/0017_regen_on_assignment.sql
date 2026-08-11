-- ============================================================================
-- 0017_regen_on_assignment.sql
-- Reminders were only (re)generated when a TASK changed. Assigning a BOA to a
-- university (or (de)activating one) did NOT create reminders for that
-- university's already-scheduled future tasks → empty "My Reminders".
-- Fix: regenerate on assignment/BOA-activity changes, ensure every university
-- has a reminder_prefs row, and backfill everything now.
-- ============================================================================

-- Regenerate reminder jobs for all future, actionable tasks of a university.
create or replace function public.regen_reminders_for_university(p_uni uuid)
returns void language plpgsql as $$
declare r record;
begin
  for r in
    select id from tasks
    where university_id = p_uni
      and execution_status in ('pending', 'in_progress')
      and publish_at is not null
      and publish_at > now()
  loop
    perform generate_reminder_jobs(r.id);
  end loop;
end $$;

-- When an assignment is added/changed/removed → regenerate that university.
create or replace function public.university_boas_regen()
returns trigger language plpgsql as $$
begin
  perform regen_reminders_for_university(coalesce(new.university_id, old.university_id));
  return coalesce(new, old);
end $$;

drop trigger if exists university_boas_regen_trg on university_boas;
create trigger university_boas_regen_trg
  after insert or update or delete on university_boas
  for each row execute function university_boas_regen();

-- When a BOA is (de)activated → regenerate each of their universities.
create or replace function public.boas_regen()
returns trigger language plpgsql as $$
declare r record;
begin
  if new.active is distinct from old.active then
    for r in select distinct university_id from university_boas where boa_id = new.id loop
      perform regen_reminders_for_university(r.university_id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists boas_regen_trg on boas;
create trigger boas_regen_trg
  after update of active on boas
  for each row execute function boas_regen();

-- Every university (incl. auto-created ones) gets a reminder_prefs row.
create or replace function public.university_default_prefs()
returns trigger language plpgsql as $$
begin
  insert into reminder_prefs (university_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists universities_default_prefs_trg on universities;
create trigger universities_default_prefs_trg
  after insert on universities
  for each row execute function university_default_prefs();

-- ── Backfill now ─────────────────────────────────────────────────────────────
insert into reminder_prefs (university_id) select id from universities on conflict do nothing;

do $$
declare r record;
begin
  for r in
    select id from tasks
    where execution_status in ('pending', 'in_progress')
      and publish_at is not null and publish_at > now()
  loop
    perform generate_reminder_jobs(r.id);
  end loop;
end $$;
