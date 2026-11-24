-- ============================================================================
-- 0032_schedule_whatsapp_sender.sql â€” deliver WhatsApp reminders every minute.
--
-- The SQL itself checks whether there is anything to do, so Vercel is only
-- called when WhatsApp is switched on AND a reminder is due (or a report
-- reminder is queued) â€” idle minutes cost nothing.
-- Reuses the Vault secret 'pingboard_cron_secret'.
-- Apply only AFTER /api/cron/send-whatsapp is deployed.
-- Pause:  select cron.unschedule('pingboard-whatsapp-send');
-- ============================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'pingboard-whatsapp-send';

select cron.schedule(
  'pingboard-whatsapp-send',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://communication-query-tracker.vercel.app/api/cron/send-whatsapp',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'pingboard_cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  )
  where exists (select 1 from app_settings where id = 1 and whatsapp_enabled)
    and (
      exists (select 1 from reminder_jobs where status = 'pending' and fire_at <= now())
      or exists (select 1 from reminder_jobs where status = 'sending' and claimed_at < now() - interval '5 minutes')
      or exists (select 1 from event_nudges where status = 'queued')
    );
  $$
);
