-- ============================================================================
-- 0001_schema.sql — core tables, enums, indexes
-- Communication Query Tracker
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
-- Note: pg_cron / pg_net (for the scheduled drainer) are enabled separately via
-- the Supabase dashboard → Database → Extensions, then scheduled per docs/REMINDER_ENGINE.md.

-- ── Enums (stable taxonomies) ───────────────────────────────────────────────
-- Kept as enums because they are stable and drive logic. Evolving taxonomies
-- (update_type, category, channel, content_type, team) are plain text backed
-- by reference tables so new values can be added without a migration.

create type user_role as enum ('admin', 'boa');

create type execution_status as enum (
  'pending',
  'in_progress',
  'published',        -- "done"
  'blocked',
  'restricted'        -- e.g. "SC Whatsapp got restricted"
);

create type task_priority as enum ('critical', 'high', 'normal');

create type reminder_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled');

-- ── Reference / lookup tables (editable in Admin UI, feed dropdowns) ─────────
create table ref_team          (value text primary key, sort_order int default 0);
create table ref_update_type   (value text primary key, sort_order int default 0);
create table ref_category      (value text primary key, sort_order int default 0);
create table ref_channel       (value text primary key, sort_order int default 0);
create table ref_content_type  (value text primary key, sort_order int default 0);

-- ── Universities ────────────────────────────────────────────────────────────
create table universities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- canonical short code / slug used in deep links: /u/<code>
  code        text not null unique,
  -- alternate spellings seen in the sheet, used by the importer to map rows
  aliases     text[] not null default '{}',
  timezone    text not null default 'Asia/Kolkata',
  -- for upcoming universities not yet live
  go_live_date date,
  active       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on universities using gin (aliases);

-- ── BOAs (people who receive reminders and do the work) ─────────────────────
create table boas (
  id            uuid primary key default gen_random_uuid(),
  -- STABLE BUSINESS KEY. This is what the sheet sync upserts on, so a person can
  -- change their name / number / university without ever creating a duplicate.
  employee_id   text not null unique,
  name          text not null,
  designation   text,
  whatsapp_e164 text not null,              -- E.164, e.g. +919876543210
  email         text,                       -- login / contact email
  preferred_language text not null default 'en',
  active        boolean not null default true,
  -- sync bookkeeping (which sheet import last touched this row)
  last_synced_at timestamptz,
  created_at    timestamptz not null default now(),
  constraint whatsapp_e164_format check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
create unique index boas_whatsapp_uidx on boas (whatsapp_e164);

-- Who a BOA gets reminded for. Supports the future cases captured in the
-- BOA intake doc: many-to-many, primary/backup escalation ordering, and
-- team-scoped routing (a BOA may handle only Student or only Parent comms).
create type assignment_role as enum ('primary', 'backup');

create table university_boas (
  university_id    uuid not null references universities(id) on delete cascade,
  boa_id           uuid not null references boas(id) on delete cascade,
  role             assignment_role not null default 'primary',
  -- '' (empty) => this BOA covers ALL teams for the university; otherwise
  -- limited to the named team (matches tasks.team, e.g. 'Student Engagement').
  team_scope       text not null default '',
  receive_reminders boolean not null default true,
  effective_from   date,
  effective_to     date,
  primary key (university_id, boa_id, team_scope)
);
create index on university_boas (boa_id);

-- Optional escalation contacts: notified if a task is still not published by
-- its publish time (a lead / manager per university).
create table escalation_contacts (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid references universities(id) on delete cascade, -- null => global
  name          text not null,
  whatsapp_e164 text not null,
  active        boolean not null default true,
  constraint esc_whatsapp_e164_format check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

-- ── App users (auth) ─────────────────────────────────────────────────────────
-- Mirrors auth.users. A BOA user is linked to a boas row; admins are not.
create table app_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       user_role not null default 'boa',
  boa_id     uuid references boas(id) on delete set null,
  full_name  text,
  created_at timestamptz not null default now()
);
create index on app_users (boa_id);

-- ── Tasks (one row per spreadsheet row) ──────────────────────────────────────
create table tasks (
  id                   uuid primary key default gen_random_uuid(),
  team                 text,                       -- ref_team
  entry_date           date,
  update_type          text,                       -- ref_update_type
  category             text,                       -- ref_category
  priority             task_priority not null default 'normal',
  university_id        uuid not null references universities(id),
  channel              text,                       -- ref_channel
  content_type         text,                       -- ref_content_type
  target_audience      text,
  message_content      text,
  poster_drive_link    text,
  publish_at           timestamptz,                -- stored UTC, shown IST
  special_instructions text,
  execution_status     execution_status not null default 'pending',
  actual_publish_date  timestamptz,
  issue_blocker        text,

  -- per-task reminder override; null => use global default settings
  reminder_offsets_min int[],

  -- import idempotency: stable hash of source sheet identity
  source_key           text unique,

  created_by           uuid references app_users(id),
  updated_by           uuid references app_users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Indexes tuned for the reminder scan and the UI boards
create index tasks_publish_at_idx      on tasks (publish_at);
create index tasks_university_idx      on tasks (university_id, execution_status);
create index tasks_status_publish_idx  on tasks (execution_status, publish_at);
-- "upcoming & not done" board — the hot path
create index tasks_pending_upcoming_idx on tasks (publish_at)
  where execution_status in ('pending', 'in_progress');

-- ── Reminder jobs (precomputed, drained by cron) ─────────────────────────────
create table reminder_jobs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  boa_id      uuid not null references boas(id) on delete cascade,
  offset_min  int  not null,                       -- 15 or 10, etc.
  fire_at     timestamptz not null,                -- publish_at - offset_min
  status      reminder_status not null default 'pending',
  attempts    int not null default 0,
  claimed_at  timestamptz,                         -- set when a drainer claims it
  wa_message_id text,
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  -- one reminder per (task, boa, offset): guarantees no duplicate sends
  unique (task_id, boa_id, offset_min)
);
-- Partial index => the drainer only ever touches the tiny "due & pending" slice,
-- so cost is independent of total row count (works the same at 1k or 50k tasks).
create index reminder_jobs_due_idx on reminder_jobs (fire_at)
  where status = 'pending';

-- ── Global settings (reminder offsets, etc.) ─────────────────────────────────
create table app_settings (
  id                     int primary key default 1,
  default_reminder_offsets_min int[] not null default '{15,10}',
  reminders_enabled      boolean not null default true,
  constraint singleton check (id = 1)
);
insert into app_settings (id) values (1) on conflict do nothing;

-- ── Internal communication (admin-only) ─────────────────────────────────────
create table internal_messages (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid references app_users(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create index internal_messages_created_idx on internal_messages (created_at desc);

-- ── Audit log ────────────────────────────────────────────────────────────────
create table audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  entity     text not null,        -- e.g. 'task'
  entity_id  uuid,
  action     text not null,        -- insert | update | delete
  changes    jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);

-- ── updated_at trigger ───────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();
