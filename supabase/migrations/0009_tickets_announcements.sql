-- ============================================================================
-- 0009_tickets_announcements.sql
-- Support tickets (staff→admin, with tags + optional link) and per-university
-- announcement bar messages.
-- ============================================================================

-- ── Tickets ──────────────────────────────────────────────────────────────────
create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

create table tickets (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid references universities(id) on delete cascade,
  raised_by     uuid references app_users(id),
  subject       text not null,
  description   text,
  status        ticket_status not null default 'open',
  priority      task_priority not null default 'normal',
  tags          text[] not null default '{}',
  link          text,                                  -- optional (e.g. Google Sheet)
  assigned_to   uuid references app_users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tickets_uni_status_idx on tickets (university_id, status);
create index tickets_status_idx on tickets (status, created_at desc);

create trigger tickets_touch before update on tickets
  for each row execute function set_updated_at();

alter table tickets enable row level security;

-- Admin: everything. Staff: read + raise for their university; edit their own open ones.
create policy tickets_admin_all on tickets
  for all using (is_admin()) with check (is_admin());
create policy tickets_staff_read on tickets
  for select using (university_id in (select my_university_ids()));
create policy tickets_staff_insert on tickets
  for insert with check (
    university_id in (select my_university_ids()) and raised_by = auth.uid()
  );
create policy tickets_staff_update_own on tickets
  for update using (raised_by = auth.uid()) with check (raised_by = auth.uid());

-- ── Announcements (drive the flowing bar) ────────────────────────────────────
create table announcements (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid references universities(id) on delete cascade,  -- null = global
  message       text not null,
  kind          text not null default 'info',          -- info | promo | warning
  active        boolean not null default true,
  created_by    uuid references app_users(id),
  created_at    timestamptz not null default now()
);
create index announcements_uni_active_idx on announcements (university_id, active);

alter table announcements enable row level security;

create policy ann_admin_all on announcements
  for all using (is_admin()) with check (is_admin());
-- Staff read active announcements for their university or global ones.
create policy ann_staff_read on announcements
  for select using (
    active and (university_id is null or university_id in (select my_university_ids()))
  );

-- ── Quick per-university stats for the announcement bar (fast, single uni) ───
create or replace function public.university_quick_stats(p_university_id uuid)
returns table (today int, pending int, overdue int, next_publish timestamptz)
language sql stable security invoker as $$
  select
    count(*) filter (
      where t.publish_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
        and t.publish_at <  (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day') at time zone 'Asia/Kolkata'
    )::int as today,
    count(*) filter (where t.execution_status in ('pending','in_progress'))::int as pending,
    count(*) filter (where t.execution_status in ('pending','in_progress') and t.publish_at < now())::int as overdue,
    min(t.publish_at) filter (where t.execution_status in ('pending','in_progress') and t.publish_at >= now()) as next_publish
  from tasks t
  where t.university_id = p_university_id;
$$;
