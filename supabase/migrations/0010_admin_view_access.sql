-- ============================================================================
-- 0010_admin_view_access.sql
-- Lets an admin grant specific staff access to the Admin console (and the
-- "← Admin" back navigation). Default false = normal BOA, university-scoped only.
-- ============================================================================

alter table app_users
  add column if not exists can_view_admin boolean not null default false;

-- (RLS unchanged: app_users_admin_write already lets admins toggle this;
--  app_users_self_read lets a user read their own flag.)
