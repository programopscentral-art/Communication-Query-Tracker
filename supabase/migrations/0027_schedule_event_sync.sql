-- ============================================================================
-- 0026_schedule_event_sync.sql — run the Event Reports sheet → app sync
-- automatically, every 15 minutes (offset from the task sync's */10 so the two
-- don't start together). Reuses the Vault secret 'pingboard_cron_secret'.
--
-- Apply only AFTER the code with /api/cron/sync-events is deployed.
-- Pause:  select cron.unschedule('pingboard-event-sync');
-- ============================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'pingboard-event-sync';

select cron.schedule(
  'pingboard-event-sync',
  '3,18,33,48 * * * *',
  $$
  select net.http_get(
    url := 'https://communication-query-tracker.vercel.app/api/cron/sync-events',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'pingboard_cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  );
  $$
);
