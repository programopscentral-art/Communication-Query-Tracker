# Reminder Engine — Ops & Setup

How the reminders actually fire, and the one-time wiring to turn them on.

## Flow recap

1. A task is created/edited → trigger `tasks_reminder_sync_trg` calls
   `generate_reminder_jobs()` → rows land in `reminder_jobs` with
   `fire_at = publish_at − offset` (default 15 & 10 min), one per eligible BOA.
2. Every minute, `pg_cron` invokes the **send-reminders** Edge Function.
3. The function calls `claim_due_reminders()` (`FOR UPDATE SKIP LOCKED` → no
   double-send), sends each via the WhatsApp provider, and marks `sent`/`failed`.
4. Already-`published` tasks are skipped; failures retry with backoff up to 4
   attempts, then show as `failed` on the Admin dashboard.

## 1. Deploy the Edge Function

```bash
npx supabase functions deploy send-reminders --no-verify-jwt
```

Set its secrets (start in mock mode to verify timing without spending on WhatsApp):

```bash
npx supabase secrets set \
  WHATSAPP_PROVIDER=mock \
  APP_URL=https://tracker.yourdomain.in \
  DRAINER_SECRET=$(openssl rand -hex 16)
# When ready for real sends (Meta example):
# npx supabase secrets set WHATSAPP_PROVIDER=meta \
#   META_WABA_PHONE_NUMBER_ID=... META_WABA_TOKEN=... META_WABA_TEMPLATE_NAME=publish_reminder
```

## 2. Schedule it with pg_cron (run once in SQL Editor)

Replace `<PROJECT_REF>` and `<DRAINER_SECRET>` with your values.

```sql
-- needs pg_cron (enabled in 0001) + pg_net for outbound HTTP
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-drainer-secret', '<DRAINER_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- to inspect / remove later:
-- select * from cron.job;
-- select cron.unschedule('send-reminders-every-minute');
```

> The 1-minute cadence + the 15/10-min offsets mean reminders land within ~1 min
> of their target. `claim_due_reminders()` also auto-recovers jobs stuck in
> `sending` (crashed worker) after 5 minutes.

## 3. WhatsApp template to register (utility category)

Submit this for approval with your provider (Meta/BSP). Variables are positional
`{{1}}…{{10}}` and MUST match the order in `_shared/message.ts → buildReminderVars`:

```
Hi {{1}}, publish reminder for {{2}}.
Priority: {{3}} | Channel: {{4}} | Type: {{5}}
Team: {{6}} · {{7}}
Publish at: {{8}} (in {{9}} min)
Notes: {{10}}
```
Add a button/URL component pointing to the deep link, or keep the link in the body.

Order: 1 boa_name, 2 university, 3 priority, 4 channel, 5 content_type, 6 team,
7 detail, 8 publish_at, 9 minutes, 10 notes.

## Monitoring

- `select status, count(*) from reminder_jobs group by 1;` — health at a glance.
- Failed queue: `select * from reminder_jobs where status='failed' order by fire_at desc;`
- The Admin UI surfaces sent/failed/skipped and lets you retry.

## Testing locally without WhatsApp

Keep `WHATSAPP_PROVIDER=mock`. Insert a task with `publish_at = now() + interval '16 minutes'`,
wait for the minute tick, and watch the function logs print the rendered message —
proving generation + timing + routing before any provider is connected.
