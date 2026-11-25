-- ============================================================================
-- 0037_teams_reminders.sql — deliver post reminders as Microsoft Teams cards.
--
--  • app_settings: Teams master switch (OFF by default), quiet hours (IST),
--    max lateness, last-run status. Teams and WhatsApp can never both be on.
--  • university_teams: per-university "Teams reminders on" toggle + NON-secret
--    details about its webhook (a masked hint, who saved it, last test, last error).
--  • The webhook URL itself is a SECRET: stored in Supabase Vault as
--    'pingboard_teams_webhook_<university uuid>'. Only the service role can set
--    or read it (set_teams_webhook / get_teams_webhook). It is never in a table
--    the browser can read.
--  • teams_cards: one row per card posted (reminder or test) with the HTTP result.
--  • reminder_jobs: sent_via ('whatsapp' | 'teams') + teams_card_id.
--  • claim_teams_reminders: claims WHOLE groups (post + timing) so one card is
--    never split across runs; does nothing while the Teams switch is off;
--    retires anything more than N minutes late first (never blasts a backlog).
--  • teams_skip_due: quiet hours — retire too-late ones first, then skip the rest.
--  • reminder_job_details: sent_via + teams_card_id appended at the end.
--
-- Backward compatible: only ADDS things. Changes no existing row — no trigger
-- fires, no reminder is regenerated, no History entry. The 1,358 old pending
-- reminders are untouched here; the first Teams run marks them "too late".
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0037.sql
-- ============================================================================

-- ── Settings ─────────────────────────────────────────────────────────────────
alter table app_settings add column if not exists teams_enabled       boolean not null default false;
alter table app_settings add column if not exists teams_quiet_start   time    not null default '22:00';
alter table app_settings add column if not exists teams_quiet_end     time    not null default '08:00';
alter table app_settings add column if not exists teams_max_late_min  int     not null default 5;
alter table app_settings add column if not exists last_teams_run_at      timestamptz;
alter table app_settings add column if not exists last_teams_run_ok      boolean;
alter table app_settings add column if not exists last_teams_run_message text;
alter table app_settings drop constraint if exists app_settings_teams_late_check;
alter table app_settings add constraint app_settings_teams_late_check check (teams_max_late_min between 1 and 60);
-- WhatsApp and Teams must never both send the same reminder.
alter table app_settings drop constraint if exists app_settings_one_reminder_channel;
alter table app_settings add constraint app_settings_one_reminder_channel
  check (not (teams_enabled and whatsapp_enabled));

-- ── Per-university Teams channel (no secrets in here) ────────────────────────
create table if not exists university_teams (
  university_id     uuid primary key references universities(id) on delete cascade,
  enabled           boolean not null default false,
  channel_name      text,          -- label only, e.g. "PingBoard CDU"
  webhook_hint      text,          -- masked, e.g. "…logic.azure.com" — never the URL
  webhook_saved_at  timestamptz,
  webhook_saved_by  text,
  last_test_at      timestamptz,
  last_test_ok      boolean,
  last_test_message text,
  last_error_at     timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now()
);
alter table university_teams enable row level security;
drop policy if exists university_teams_read on university_teams;
create policy university_teams_read on university_teams for select using (has_admin_read());
drop policy if exists university_teams_admin_write on university_teams;
create policy university_teams_admin_write on university_teams for all using (is_admin()) with check (is_admin());
drop trigger if exists university_teams_touch on university_teams;
create trigger university_teams_touch before update on university_teams
  for each row execute function set_updated_at();

-- ── Card log ─────────────────────────────────────────────────────────────────
create table if not exists teams_cards (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'reminder' check (kind in ('reminder', 'test')),
  university_id uuid references universities(id) on delete cascade,
  task_id       uuid references tasks(id) on delete set null,
  offset_min    int,
  posted_at     timestamptz not null default now(),
  ok            boolean not null,
  http_status   int,
  mentioned     int not null default 0,
  not_tagged    int not null default 0,
  error         text,
  sent_by       text            -- test cards: the admin's email
);
create index if not exists teams_cards_posted_idx on teams_cards (posted_at desc);
create index if not exists teams_cards_task_idx on teams_cards (task_id);
alter table teams_cards enable row level security;
drop policy if exists teams_cards_read on teams_cards;
create policy teams_cards_read on teams_cards for select using (has_admin_read());
-- No write policy: only the service role (the sender / test button) writes.

-- ── Reminder jobs: which channel delivered it ────────────────────────────────
alter table reminder_jobs add column if not exists sent_via text;
alter table reminder_jobs drop constraint if exists reminder_jobs_sent_via_check;
alter table reminder_jobs add constraint reminder_jobs_sent_via_check check (sent_via in ('whatsapp', 'teams'));
alter table reminder_jobs add column if not exists teams_card_id uuid references teams_cards(id) on delete set null;
create index if not exists reminder_jobs_teams_card_idx on reminder_jobs (teams_card_id) where teams_card_id is not null;

-- ── Webhook URL in Vault (service role only) ─────────────────────────────────
-- p_url NULL = remove the saved URL. The URL must be a Power Automate workflow URL.
create or replace function public.set_teams_webhook(p_university_id uuid, p_url text, p_hint text, p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare
  secret_name text := 'pingboard_teams_webhook_' || p_university_id::text;
  sid uuid;
begin
  if not exists (select 1 from universities where id = p_university_id) then
    raise exception 'Unknown university';
  end if;

  if p_url is null then
    delete from vault.secrets where name = secret_name;
    insert into university_teams (university_id) values (p_university_id) on conflict do nothing;
    update university_teams
       set webhook_hint = null, webhook_saved_at = now(), webhook_saved_by = p_by, enabled = false
     where university_id = p_university_id;
    return;
  end if;

  if p_url !~ '^https://[A-Za-z0-9.-]+\.(logic\.azure\.com|api\.powerplatform\.com)(:443)?/[^[:space:]]*workflows/[^[:space:]]+$' then
    raise exception 'That is not a Teams Workflows webhook URL (it must start with https:// and be a Power Automate workflow link).';
  end if;

  select id into sid from vault.secrets where name = secret_name;
  if sid is null then
    perform vault.create_secret(p_url, secret_name, 'Teams Workflows webhook for PingBoard reminders');
  else
    perform vault.update_secret(sid, p_url);
  end if;

  insert into university_teams (university_id) values (p_university_id) on conflict do nothing;
  update university_teams
     set webhook_hint = left(coalesce(p_hint, 'Saved'), 80), webhook_saved_at = now(), webhook_saved_by = p_by,
         last_error = null, last_error_at = null
   where university_id = p_university_id;
end $$;

create or replace function public.get_teams_webhook(p_university_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = 'pingboard_teams_webhook_' || p_university_id::text
   limit 1
$$;

-- ── Claim due reminders as whole cards (post + timing) ───────────────────────
create or replace function public.claim_teams_reminders(p_limit_groups int default 20, p_max_late_min int default 5)
returns setof reminder_jobs language plpgsql security definer set search_path = public as $$
begin
  -- Belt and braces: never claim anything while Teams is switched off.
  if not exists (select 1 from app_settings where id = 1 and teams_enabled) then
    return;
  end if;

  -- A worker died mid-send: release after 5 min (the lateness guard decides next).
  update reminder_jobs set status = 'pending', claimed_at = null
   where status = 'sending' and claimed_at < now() - interval '5 minutes';

  update reminder_jobs
     set status = 'skipped', skip_reason = 'Too late — the reminder time had already passed', claimed_at = null
   where status = 'pending' and fire_at < now() - make_interval(mins => p_max_late_min);

  return query
  update reminder_jobs r
     set status = 'sending', attempts = r.attempts + 1, claimed_at = now()
    from (
      select j.id from reminder_jobs j
       where j.status = 'pending' and j.fire_at <= now()
         and (j.task_id, j.offset_min) in (
           select g.task_id, g.offset_min from reminder_jobs g
            where g.status = 'pending' and g.fire_at <= now()
            group by g.task_id, g.offset_min
            order by min(g.fire_at)
            limit p_limit_groups)
       for update skip locked
    ) due
   where r.id = due.id
  returning r.*;
end $$;

-- Quiet hours: retire too-late ones with the right reason first, then skip the rest.
create or replace function public.teams_skip_due(p_reason text, p_max_late_min int default 5)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from app_settings where id = 1 and teams_enabled) then
    return 0;
  end if;
  update reminder_jobs
     set status = 'skipped', skip_reason = 'Too late — the reminder time had already passed', claimed_at = null
   where status = 'pending' and fire_at < now() - make_interval(mins => p_max_late_min);
  update reminder_jobs set status = 'skipped', skip_reason = p_reason, claimed_at = null
   where status = 'pending' and fire_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Reminder log view: channel + card appended at the end ────────────────────
create or replace view reminder_job_details as
  select r.id as job_id, r.boa_id, r.offset_min, r.attempts, r.status, r.fire_at, r.sent_at,
         b.whatsapp_e164, b.name as boa_name, b.preferred_language,
         u.name as university_name, u.code as university_code, u.timezone,
         t.id as task_id, t.team, t.update_type, t.category, t.priority,
         t.channel, t.content_type, t.target_audience, t.message_content,
         t.poster_drive_link, t.publish_at, t.special_instructions,
         t.execution_status,
         r.skip_reason, r.error, r.delivery_status, r.wa_message_id,
         r.sent_via, r.teams_card_id
  from reminder_jobs r
  join boas b on b.id = r.boa_id
  join tasks t on t.id = r.task_id
  join universities u on u.id = t.university_id;

-- ── Lock the new functions to the service role ───────────────────────────────
revoke execute on function public.set_teams_webhook(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.get_teams_webhook(uuid)                   from public, anon, authenticated;
revoke execute on function public.claim_teams_reminders(int, int)           from public, anon, authenticated;
revoke execute on function public.teams_skip_due(text, int)                 from public, anon, authenticated;
grant  execute on function public.set_teams_webhook(uuid, text, text, text) to service_role;
grant  execute on function public.get_teams_webhook(uuid)                   to service_role;
grant  execute on function public.claim_teams_reminders(int, int)           to service_role;
grant  execute on function public.teams_skip_due(text, int)                 to service_role;
