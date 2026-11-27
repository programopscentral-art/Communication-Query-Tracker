-- ============================================================================
-- 0043_mrv_staff_correction.sql — corrects 0042 for MRV (DATA ONLY).
-- The user, 2026-11-27: MRV, MRU (Mallareddy University) and MRDU are DIFFERENT
-- universities; Sheet3's code TG003 mixes them. Only these stay at PingBoard's MRV:
-- Powaku Sai Aashray, Geejula Akhil Kumar (BOA), Anand Talambrala Teja (PM),
-- Irupaka Manideep Reddy (COS) — unchanged here.
--  • Gompa Poojitha (NW0006888, MRV staff since Aug; Sheet3 says MRU = not on
--    PingBoard) → deactivated, receive reminders OFF, link kept (as for the other
--    staff Sheet3 moves to a university not on PingBoard).
--  • Kucharlapati Sai Thrishal Varma (NW0007502) and Palleti Karunakar Reddy
--    (NW0007508) are MRDU staff that 0042 ADDED to MRV by mistake 30 min earlier
--    (no reminders, no account, nothing refers to them) → those two records removed.
--  • Thilak S (NW0007004): Sheet3 code TN006 = SNS (Coimbatore) but university
--    "JOY (Chennai)" — not a clear match (user rule 2026-11-27: map only clear
--    matches). 0042 added him to JOY by name → that record removed too.
-- Snapshot: C:\Users\Asus\Documents\PingBoard-backups\snapshot-0043-before.json
-- Rollback: C:\Users\Asus\Documents\PingBoard-backups\rollback-0043.sql
-- ============================================================================

-- Gompa Poojitha: deactivate
do $$ declare n int; begin
  update boas set active = false where employee_id = 'NW0006888' and active;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Gompa Poojitha: deactivate: expected 1 rows, got %', n; end if;
end $$;

-- Gompa Poojitha: reminders off
do $$ declare n int; begin
  update university_boas set receive_reminders = false where boa_id = (select id from boas where employee_id = 'NW0006888') and receive_reminders;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Gompa Poojitha: reminders off: expected 1 rows, got %', n; end if;
end $$;

-- remove the 3 unclear staff added by 0042 (2 MRDU, Thilak S)
do $$ declare n int; begin
  delete from boas where employee_id in ('NW0007502', 'NW0007508', 'NW0007004') and created_at > '2026-11-27 10:00+00';
  get diagnostics n = row_count;
  if n <> 3 then raise exception 'remove the 3 unclear staff added by 0042 (2 MRDU, Thilak S): expected 3 rows, got %', n; end if;
end $$;
