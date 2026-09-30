-- ============================================================================
-- 0029_schedule_event_nudges.sql — queue reminders for pending event reports
-- once a day at 10:00 IST (04:30 UTC). Reuses the Vault secret
-- 'pingboard_cron_secret'. Apply only AFTER /api/cron/event-nudges is deployed.
-- Pause:  select cron.unschedule('pingboard-event-nudges');
-- ============================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'pingboard-event-nudges';

select cron.schedule(
  'pingboard-event-nudges',
  '30 4 * * *',
  $$
  select net.http_get(
    url := 'https://communication-query-tracker.vercel.app/api/cron/event-nudges',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'pingboard_cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  );
  $$
);
