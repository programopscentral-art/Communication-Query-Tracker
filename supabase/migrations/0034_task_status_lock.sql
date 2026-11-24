-- ============================================================================
-- 0034_task_status_lock.sql — university staff set a task's outcome once.
--
-- For a signed-in user who is NOT a full admin (i.e. university staff):
--  • They may never set a task to 'in_progress' (that status is for admins and
--    the sheet).
--  • Once a task's status is no longer 'pending', they can't change its status,
--    issue/blocker note or actual publish date — from any page or API call.
-- Full admins (is_admin()) can change all of these at any time. The sheet sync is
-- unaffected: the automatic sync runs as the service role, "Sync now" as a full admin.
-- Nothing else about tasks changes: reminders, History/audit, the three-way merge
-- and existing data stay exactly as they are.
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0034.sql
-- ============================================================================

create or replace function public.tasks_status_lock()
returns trigger language plpgsql as $$
declare
  is_staff boolean := current_user in ('authenticated', 'anon') and not is_admin();
begin
  if not is_staff then
    return new;
  end if;

  if new.execution_status = 'in_progress' and new.execution_status is distinct from old.execution_status then
    raise exception 'Only an admin can set a task to In progress.'
      using errcode = 'insufficient_privilege';
  end if;

  if old.execution_status <> 'pending'
     and (new.execution_status, new.issue_blocker, new.actual_publish_date)
         is distinct from (old.execution_status, old.issue_blocker, old.actual_publish_date) then
    raise exception 'Status is locked. Contact an admin to change it.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists tasks_status_lock_trg on tasks;
create trigger tasks_status_lock_trg
  before update of execution_status, issue_blocker, actual_publish_date on tasks
  for each row execute function tasks_status_lock();
