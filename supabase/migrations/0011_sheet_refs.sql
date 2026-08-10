-- ============================================================================
-- 0011_sheet_refs.sql — remember each task's origin row in the Google Sheet,
-- so the UI can deep-link "View in Sheet" straight to that row/tab.
-- ============================================================================

alter table tasks add column if not exists source_row int;    -- 1-based row in the tab
alter table tasks add column if not exists source_gid text;   -- sheet tab gid
