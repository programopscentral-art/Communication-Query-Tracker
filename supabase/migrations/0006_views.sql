-- ============================================================================
-- 0006_views.sql — dashboard views (RLS-respecting)
-- ============================================================================

-- Per-university status rollup for the Admin overview.
create or replace view task_status_by_university as
  select u.id   as university_id,
         u.name as university,
         u.code as code,
         count(t.*) filter (where t.execution_status = 'pending')     as pending,
         count(t.*) filter (where t.execution_status = 'in_progress') as in_progress,
         count(t.*) filter (where t.execution_status = 'published')   as published,
         count(t.*) filter (where t.execution_status = 'blocked')     as blocked,
         count(t.*) filter (where t.execution_status = 'restricted')  as restricted,
         count(t.*)                                                   as total,
         count(t.*) filter (
           where t.execution_status in ('pending','in_progress')
             and t.publish_at < now()
         ) as overdue
  from universities u
  left join tasks t on t.university_id = u.id
  group by u.id, u.name, u.code;

-- security_invoker => the view runs with the caller's RLS, so a BOA only sees
-- their own universities' numbers, not everyone's. (Postgres 15+ / Supabase.)
alter view task_status_by_university set (security_invoker = on);
alter view reminder_job_details      set (security_invoker = on);
