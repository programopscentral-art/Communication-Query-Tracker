-- ============================================================================
-- 0035_task_batches.sql — posts can target one or more student batches.
--
--  • ref_batch: the batch dropdown list (like the other ref_* lists: everyone
--    signed in can read it, full admins can add values). Seeded with 2025, 2026.
--  • tasks.batches (text[]): the batches a post targets. ['All'] = every batch,
--    including future ones. NULL = not specified ("—"). NOT part of source_key.
--  • task_sheet_state.batches: the batches the SHEET last showed for a row
--    (NULL = never seen) — so a sheet edit can be told apart from an app edit,
--    exactly like status / actual / issue.
--  • existing_task_sync_state(): additionally returns each row's current batches
--    ('b') and the sheet's last-seen batches ('sb'). Everything else unchanged.
-- Adding the columns changes no existing row (both start NULL): no trigger,
-- History entry or reminder change.
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0035.sql
-- ============================================================================

create table if not exists ref_batch (value text primary key, sort_order int default 0);
alter table ref_batch enable row level security;
drop policy if exists ref_batch_read on ref_batch;
create policy ref_batch_read on ref_batch for select using (auth.uid() is not null);
drop policy if exists ref_batch_admin on ref_batch;
create policy ref_batch_admin on ref_batch for all using (is_admin()) with check (is_admin());
insert into ref_batch (value, sort_order) values ('2025', 1), ('2026', 2)
on conflict (value) do nothing;

alter table tasks            add column if not exists batches text[];
alter table task_sheet_state add column if not exists batches text[];

create or replace function public.existing_task_sync_state()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized';
  end if;
  return coalesce((
    select jsonb_object_agg(t.source_key, jsonb_build_object(
      'o',    t.origin,
      's',    t.execution_status,
      'a',    t.actual_publish_date,
      'i',    t.issue_blocker,
      'seen', ss.source_key is not null,
      'ss',   ss.status,
      'sa',   ss.actual,
      'si',   ss.issue,
      'b',    t.batches,     -- 0035
      'sb',   ss.batches))   -- 0035
    from tasks t
    left join task_sheet_state ss on ss.source_key = t.source_key
    where t.source_key is not null
  ), '{}'::jsonb);
end $$;
