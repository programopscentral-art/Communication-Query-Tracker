-- ============================================================================
-- 0018_existing_keys_rpc.sql — fast lookup of already-imported rows for the
-- in-app "Sync now" button. Returns { source_key: origin } as one JSON object
-- (not row-capped by PostgREST), so the sync only writes new/changed rows.
-- Admin-only.
-- ============================================================================

create or replace function public.existing_task_source_keys()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  return coalesce(
    (select jsonb_object_agg(source_key, origin) from tasks where source_key is not null),
    '{}'::jsonb
  );
end $$;
  