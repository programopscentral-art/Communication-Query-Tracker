-- ============================================================================
-- 0025_event_views.sql — summary views for the Event Reports pages, so the DB
-- does the counting (fast, and no 1000-row API cap). All security_invoker, so
-- RLS applies: staff see their universities, admins/read-only admins see all.
-- ============================================================================

-- Month × university report completion.
create or replace view v_event_month_stats with (security_invoker = on) as
select period, university_id,
       count(*)::int                                             as total,
       count(*) filter (where report_filled >= 7)::int           as complete,
       count(*) filter (where report_filled between 1 and 6)::int as partial,
       count(*) filter (where report_filled = 0)::int            as pending,
       count(*) filter (where sheet_missing_since is not null)::int as missing
from events
group by period, university_id;

-- Suggestions for the "choice" fields (existing values, most used first).
create or replace view v_event_options with (security_invoker = on) as
          select 'conducted_by'::text as field, btrim(conducted_by) as value, count(*)::int as n from events where nullif(btrim(conducted_by), '') is not null group by 2
union all select 'cma_assigned', btrim(cma_assigned), count(*)::int from events where nullif(btrim(cma_assigned), '') is not null group by 2
union all select 'category',     btrim(category),     count(*)::int from events where nullif(btrim(category), '')     is not null group by 2
union all select 'subcategory',  btrim(subcategory),  count(*)::int from events where nullif(btrim(subcategory), '')  is not null group by 2
union all select 'coverage',     btrim(coverage),     count(*)::int from events where nullif(btrim(coverage), '')     is not null group by 2
union all select 'mode',         btrim(mode),         count(*)::int from events where nullif(btrim(mode), '')         is not null group by 2
union all select 'zoho_status',  btrim(zoho_status),  count(*)::int from events where nullif(btrim(zoho_status), '')  is not null group by 2;

-- How each campus name written in the sheet maps to a university.
create or replace view v_event_campus_names with (security_invoker = on) as
select university_raw, university_id, count(*)::int as n
from events
where university_raw is not null
group by university_raw, university_id;

-- Dates to check: unreadable, or not in the month (tab) the event is filed under.
create or replace view v_event_date_issues with (security_invoker = on) as
select id, title, period, university_id, event_date, event_date_text, source_tab, source_row, source_gid,
       case when event_date is null then 'unreadable' else 'other_month' end as issue
from events
where event_date_text is not null
  and (event_date is null or date_trunc('month', event_date)::date <> period);

-- The sheet's Unique Key used on more than one row (those rows fall back to the fingerprint).
create or replace view v_event_duplicate_keys with (security_invoker = on) as
select sheet_seen->>'sheet_key_raw' as key,
       count(*)::int as n,
       string_agg(coalesce(source_tab, '?') || ' row ' || coalesce(source_row::text, '?'), ', '
                  order by source_tab, source_row) as rows
from events
where sheet_key is null and sheet_seen->>'sheet_key_raw' is not null
group by 1
having count(*) > 1;
