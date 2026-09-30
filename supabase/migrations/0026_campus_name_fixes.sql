-- ============================================================================
-- 0026_campus_name_fixes.sql — university naming decided by the team (2026-09-30).
--   • "Takshasila" is displayed as "Takshashila" (code/URL unchanged; the old
--     spelling stays an alias so the Communication sheet keeps matching).
--   • NIAT-Chevella, NIAT Chevella, NIAT-BITS, BITs Chevella and Chevella are
--     all ONE university: NIAT-Chevella.
--   • CIET = Chalapathy (CIET events show under Chalapathy).
-- ============================================================================

update universities
set name = 'Takshashila',
    aliases = case when 'Takshasila' = any(coalesce(aliases, '{}')) then aliases
                   else array_append(coalesce(aliases, '{}'), 'Takshasila') end
where code = 'takshasila';

update universities
set aliases = aliases || array(
  select x from unnest(array['BITs Chevella', 'Chevella']) x
  where not (x = any(coalesce(aliases, '{}')))
)
where code = 'niat-chevella';

-- Link every event written with a Chevella spelling to NIAT-Chevella.
update events
set university_id = (select id from universities where code = 'niat-chevella')
where regexp_replace(lower(coalesce(university_raw, '')), '[^a-z0-9]+', '', 'g') in ('chevella', 'bitschevella')
  and university_id is distinct from (select id from universities where code = 'niat-chevella');
