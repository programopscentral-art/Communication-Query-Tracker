-- ============================================================================
-- 0008_history.sql — audit trail + history views (admin-only via RLS)
-- Captures who changed what on tasks, and exposes university-wise + staff-wise
-- history for the Admin History tab.
-- ============================================================================

-- ── Capture task changes into audit_log (actor = the signed-in user) ─────────
create or replace function public.audit_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}'::jsonb;
begin
  if new.execution_status is distinct from old.execution_status then
    ch := ch || jsonb_build_object('status',
      jsonb_build_object('from', old.execution_status, 'to', new.execution_status));
  end if;
  if new.issue_blocker is distinct from old.issue_blocker then
    ch := ch || jsonb_build_object('issue_blocker',
      jsonb_build_object('from', old.issue_blocker, 'to', new.issue_blocker));
  end if;
  if new.actual_publish_date is distinct from old.actual_publish_date then
    ch := ch || jsonb_build_object('actual_publish_date',
      jsonb_build_object('from', old.actual_publish_date, 'to', new.actual_publish_date));
  end if;
  if ch <> '{}'::jsonb then
    insert into audit_log (actor_id, entity, entity_id, action, changes)
    values (auth.uid(), 'task', new.id, 'update', ch);
  end if;
  return new;
end $$;

drop trigger if exists audit_task_change_trg on tasks;
create trigger audit_task_change_trg
  after update on tasks
  for each row execute function audit_task_change();

-- ── University-wise history rollup ───────────────────────────────────────────
create or replace view v_university_history as
  select u.id as university_id, u.name as university, u.code,
         count(t.*)                                                    as total,
         count(t.*) filter (where t.execution_status = 'published')    as published,
         count(t.*) filter (where t.execution_status = 'pending')      as pending,
         count(t.*) filter (where t.execution_status = 'in_progress')  as in_progress,
         count(t.*) filter (where t.execution_status = 'blocked')      as blocked,
         count(t.*) filter (where t.execution_status = 'restricted')   as restricted,
         count(t.*) filter (
           where t.execution_status in ('pending','in_progress') and t.publish_at < now()
         )                                                             as overdue,
         max(t.updated_at)          as last_task_update,
         max(t.actual_publish_date) as last_publish,
         (select count(*) from university_boas ub where ub.university_id = u.id) as staff_count
  from universities u
  left join tasks t on t.university_id = u.id
  group by u.id, u.name, u.code;
alter view v_university_history set (security_invoker = on);

-- ── Staff-wise activity ──────────────────────────────────────────────────────
create or replace view v_staff_activity as
  select au.id as user_id, b.id as boa_id, b.name, b.employee_id, b.designation,
         b.whatsapp_e164, b.active,
         (select count(*) from audit_log a where a.actor_id = au.id)                       as updates_made,
         (select max(a.created_at) from audit_log a where a.actor_id = au.id)              as last_active,
         (select count(*) from reminder_jobs rj where rj.boa_id = b.id)                    as reminders_total,
         (select count(*) from reminder_jobs rj where rj.boa_id = b.id and rj.status='sent') as reminders_sent
  from app_users au
  join boas b on b.id = au.boa_id;
alter view v_staff_activity set (security_invoker = on);

-- ── Readable activity feed (audit joined to actor/task/university) ───────────
create or replace view v_recent_activity as
  select a.id, a.created_at, a.action, a.changes, a.actor_id, a.entity_id,
         coalesce(au.full_name, b.name, 'System') as actor_name,
         b.employee_id, b.id as boa_id,
         t.channel, t.content_type,
         u.name as university_name, u.code as university_code
  from audit_log a
  left join app_users au on au.id = a.actor_id
  left join boas b on b.id = au.boa_id
  left join tasks t on a.entity = 'task' and t.id = a.entity_id
  left join universities u on u.id = t.university_id;
alter view v_recent_activity set (security_invoker = on);
