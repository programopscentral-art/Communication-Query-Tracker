-- ============================================================================
-- 0020_task_edit_delete_audit.sql — audit admin content edits + deletions.
-- Broadens the task update trigger to record content edits, and adds a delete
-- trigger. Both capture the actor (auth.uid()) at the DB layer.
-- ============================================================================

create or replace function public.audit_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ch     jsonb := '{}'::jsonb;
  edited text[] := '{}';
begin
  -- outcome fields (status / actual / blocker)
  if new.execution_status is distinct from old.execution_status then
    ch := ch || jsonb_build_object('status', jsonb_build_object('from', old.execution_status, 'to', new.execution_status));
  end if;
  if new.issue_blocker is distinct from old.issue_blocker then
    ch := ch || jsonb_build_object('issue_blocker', jsonb_build_object('from', old.issue_blocker, 'to', new.issue_blocker));
  end if;
  if new.actual_publish_date is distinct from old.actual_publish_date then
    ch := ch || jsonb_build_object('actual_publish_date', jsonb_build_object('from', old.actual_publish_date, 'to', new.actual_publish_date));
  end if;

  -- content edits → collect changed field names
  if new.team              is distinct from old.team              then edited := array_append(edited, 'team'); end if;
  if new.update_type       is distinct from old.update_type       then edited := array_append(edited, 'update_type'); end if;
  if new.category          is distinct from old.category          then edited := array_append(edited, 'category'); end if;
  if new.priority          is distinct from old.priority          then edited := array_append(edited, 'priority'); end if;
  if new.channel           is distinct from old.channel           then edited := array_append(edited, 'channel'); end if;
  if new.content_type      is distinct from old.content_type      then edited := array_append(edited, 'content_type'); end if;
  if new.target_audience   is distinct from old.target_audience   then edited := array_append(edited, 'target_audience'); end if;
  if new.message_content   is distinct from old.message_content   then edited := array_append(edited, 'message'); end if;
  if new.poster_drive_link is distinct from old.poster_drive_link then edited := array_append(edited, 'poster'); end if;
  if new.publish_at        is distinct from old.publish_at        then edited := array_append(edited, 'publish_at'); end if;
  if new.special_instructions is distinct from old.special_instructions then edited := array_append(edited, 'special_instructions'); end if;
  if new.university_id     is distinct from old.university_id     then edited := array_append(edited, 'university'); end if;
  if array_length(edited, 1) is not null then
    ch := ch || jsonb_build_object('edited', to_jsonb(edited));
  end if;

  if ch <> '{}'::jsonb then
    insert into audit_log (actor_id, entity, entity_id, action, changes)
    values (auth.uid(), 'task', new.id, case when ch ? 'edited' then 'edit' else 'update' end, ch);
  end if;
  return new;
end $$;

-- Deletions → keep a record (with a snapshot, since the row is gone).
create or replace function public.audit_task_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, entity, entity_id, action, changes)
  values (auth.uid(), 'task', old.id, 'delete', jsonb_build_object('deleted', jsonb_build_object(
    'university', (select name from universities where id = old.university_id),
    'channel', old.channel,
    'content_type', old.content_type,
    'publish_at', old.publish_at,
    'message', left(coalesce(old.message_content, ''), 80)
  )));
  return old;
end $$;

drop trigger if exists audit_task_delete_trg on tasks;
create trigger audit_task_delete_trg
  after delete on tasks
  for each row execute function audit_task_delete();

