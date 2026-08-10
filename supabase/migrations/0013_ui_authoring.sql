-- ============================================================================
-- 0013_ui_authoring.sql — author tasks directly in the UI (no Google Sheet),
-- with dynamic "add-new" dropdowns + a Sheet⇄UI data-source switch.
-- ============================================================================

-- New reference tables (dropdowns). Existing ones from 0001: ref_team,
-- ref_update_type, ref_category, ref_channel, ref_content_type.
create table if not exists ref_priority        (value text primary key, sort_order int default 0);
create table if not exists ref_target_audience (value text primary key, sort_order int default 0);

-- Priority becomes free text (still styled) so admins can add custom levels.
-- reminder_job_details depends on priority, so drop + recreate it around the change.
drop view if exists reminder_job_details;
alter table tasks alter column priority drop default;
alter table tasks alter column priority type text using priority::text;
alter table tasks alter column priority set default 'Normal';

create view reminder_job_details as
  select r.id as job_id, r.offset_min, r.attempts, r.status,
         b.whatsapp_e164, b.name as boa_name, b.preferred_language,
         u.name as university_name, u.code as university_code, u.timezone,
         t.id as task_id, t.team, t.update_type, t.category, t.priority,
         t.channel, t.content_type, t.target_audience, t.message_content,
         t.poster_drive_link, t.publish_at, t.special_instructions,
         t.execution_status
  from reminder_jobs r
  join boas b on b.id = r.boa_id
  join tasks t on t.id = r.task_id
  join universities u on u.id = t.university_id;
alter view reminder_job_details set (security_invoker = on);

-- Row origin: 'sheet' (imported) or 'ui' (authored in-app). Existing rows = sheet.
alter table tasks add column if not exists origin text not null default 'sheet';
alter table tasks add column if not exists created_source_by uuid references app_users(id);

-- Global switch: 'sheet' = Google Sheet is source of truth (import shows in UI);
--               'ui'    = the app is source of truth (authoring on, import paused).
alter table app_settings add column if not exists data_source_mode text not null default 'sheet'
  check (data_source_mode in ('sheet', 'ui'));

-- ── RLS for the new ref tables (read: signed-in, write: admin) ───────────────
alter table ref_priority        enable row level security;
alter table ref_target_audience enable row level security;
do $$
declare t text;
begin
  foreach t in array array['ref_priority','ref_target_audience'] loop
    execute format('create policy %I_read on %I for select using (auth.uid() is not null);', t, t);
    execute format('create policy %I_admin on %I for all using (is_admin()) with check (is_admin());', t, t);
  end loop;
end $$;

-- ── Seed every dropdown with the confirmed values (idempotent) ───────────────
insert into ref_team (value, sort_order) values
  ('Student Engagement',1),('Student Success',2),('Parent Communication',3),('Other',9)
on conflict (value) do nothing;

insert into ref_update_type (value, sort_order) values
  ('Announcement',1),('Positive Message',2),('Reminder',3),('Update',4),
  ('Event Campaign',5),('Other',9)
on conflict (value) do nothing;

insert into ref_category (value, sort_order) values
  ('Innovators Workshop',1),('Creators lab',2),('CP',3),('Club activities',4),
  ('Master class',5),('Murf AI',6),('GSoc',7),('Cultural',8),('Sports',9),
  ('Global Immersion',10),('Makers conclave',11),('MINT',12),('Other',99)
on conflict (value) do nothing;

insert into ref_priority (value, sort_order) values
  ('Normal',1),('High',2),('Critical',3)
on conflict (value) do nothing;

insert into ref_channel (value, sort_order) values
  ('Parent App',1),('Student App',2),('Student Whatsapp',3),
  ('Student App and Whatsapp',4),('Parent App and Whatsapp',5),('Parent WhatsApp',6)
on conflict (value) do nothing;

insert into ref_content_type (value, sort_order) values
  ('Plain Text',1),('Markdown',2),('HTML',3)
on conflict (value) do nothing;

insert into ref_target_audience (value, sort_order) values
  ('All students',1),('User specific',2),('All Parents',3)
on conflict (value) do nothing;
