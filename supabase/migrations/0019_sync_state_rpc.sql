-- ============================================================================
-- 0019_sync_state_rpc.sql — richer sync-state lookup so "Sync now" can detect
-- and apply STATUS / outcome changes from the sheet (not just insert new rows).
-- Returns { source_key: { o:origin, s:status, a:actual_publish_date, i:issue } }.
-- Admin-only.
-- ============================================================================

create or replace function public.existing_task_sync_state()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  return coalesce((
    select jsonb_object_agg(source_key, jsonb_build_object(
      'o', origin,
      's', execution_status,
      'a', actual_publish_date,
      'i', issue_blocker))
    from tasks where source_key is not null
  ), '{}'::jsonb);
end $$;
