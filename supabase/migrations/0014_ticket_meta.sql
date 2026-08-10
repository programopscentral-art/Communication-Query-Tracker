-- ============================================================================
-- 0014_ticket_meta.sql — richer tickets: who raised (+when, already have
-- created_at), and an optional "tagged to" assignee. Names/emails are
-- denormalized so a BOA can see them without needing to read other users'
-- app_users rows (RLS-safe + fast, no joins).
-- ============================================================================

alter table tickets add column if not exists raised_by_name    text;
alter table tickets add column if not exists raised_by_email   text;
alter table tickets add column if not exists assigned_to_name  text;
alter table tickets add column if not exists assigned_to_email text;
alter table tickets add column if not exists assigned_at       timestamptz;

-- Faster Today/Yesterday/Upcoming windowing on when the ticket was raised.
create index if not exists tickets_created_idx on tickets (created_at desc);
