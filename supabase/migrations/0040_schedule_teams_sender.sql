-- ============================================================================
-- 0040_schedule_teams_sender.sql — deliver Teams reminder cards every minute.
--
-- The SQL itself checks whether there is anything to do, so Vercel is only
-- called when Teams is switched ON and a reminder is due (or a card got stuck
-- mid-send) — while the switch is off this job does nothing at all.
-- Reuses the Vault secret 'pingboard_cron_secret'.
--
-- Apply ONLY after: the Teams code is deployed (/api/cron/send-teams answers
-- 401 without the secret), the CDU webhook is saved, and the CDU test cards —
-- including the one tagging someone who is NOT in the team — have worked.
-- Pause:  select cron.unschedule('pingboard-teams-send');
-- Rollback: the same unschedule line (nothing else is created).
-- ============================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'pingboard-teams-send';

select cron.schedule(
  'pingboard-teams-send',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://communication-query-tracker.vercel.app/api/cron/send-teams',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'pingboard_cron_secret'
      )
    ),
    timeout_milliseconds := 60000
  )
  where exists (select 1 from app_settings where id = 1 and teams_enabled)
    and (
      exists (select 1 from reminder_jobs where status = 'pending' and fire_at <= now())
      or exists (select 1 from reminder_jobs where status = 'sending' and claimed_at < now() - interval '5 minutes')
    );
  $$
);
