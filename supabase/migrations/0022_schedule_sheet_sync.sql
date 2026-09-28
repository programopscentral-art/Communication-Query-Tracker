-- ============================================================================
-- 0022_schedule_sheet_sync.sql — run the Sheet → app sync automatically.
--
-- Supabase pg_cron calls the Vercel endpoint every 10 minutes via pg_net.
-- (Vercel Hobby cron can only run once a day, so the schedule lives here.)
-- Each run costs ~2.5 s of function CPU: every 10 min ≈ 3 CPU-h/month, which
-- fits Vercel Hobby. On Vercel Pro, '*/5 * * * *' (every 5 min) is fine.
--
-- Prerequisites (apply this file only AFTER both are done):
--   1. The app is deployed with CRON_SECRET + SUPABASE_SERVICE_ROLE_KEY set in
--      Vercel → Settings → Environment Variables (server-only, NOT NEXT_PUBLIC).
--   2. The same CRON_SECRET is stored in Supabase Vault as 'pingboard_cron_secret'
--      — run `node scripts/set-cron-secret.mjs` (reads CRON_SECRET from .env).
--
-- The secret is read from Vault at run time, so it never appears in git or in
-- cron.job. To change the interval, re-run with a different cron expression.
-- Pause:  select cron.unschedule('pingboard-sheet-sync');
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'pingboard-sheet-sync';

select cron.schedule(
  'pingboard-sheet-sync',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://communication-query-tracker.vercel.app/api/cron/sync-sheet',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'pingboard_cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  );
  $$
);
