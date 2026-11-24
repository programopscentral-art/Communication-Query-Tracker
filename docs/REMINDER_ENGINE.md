# Reminder Engine — how WhatsApp reminders fire

Setup steps (Meta account, templates, Vercel keys, go-live): **`docs/WHATSAPP_SETUP.md`**.

## Flow

1. A task is created/edited (sheet sync, UI, or staff updating status) → trigger
   `tasks_reminder_sync_trg` → `generate_reminder_jobs()` upserts one `reminder_jobs`
   row per eligible staff member × offset, `fire_at = publish_at − offset`
   (offsets: task → university pref → global `{15,10}`). Runs as the table owner
   (0031) so staff updates work under RLS.
2. The daily 10:00 IST event check queues `event_nudges` for overdue event reports.
3. pg_cron job **`pingboard-whatsapp-send`** (0032) runs every minute. Its SQL only
   calls Vercel when WhatsApp is **switched on** and something is due — idle minutes
   cost nothing.
4. **`/api/cron/send-whatsapp`** (`lib/whatsappSender.ts`):
   - switch off → nothing; **quiet hours** (default 22:00–08:00 IST) → due reminders are
     *skipped*, never delayed into the morning;
   - `claim_due_reminders(100, max_late)` skips anything more than `whatsapp_max_late_min`
     (default 5) late, then claims due jobs with `FOR UPDATE SKIP LOCKED` (no double sends);
   - per job: already published / no number / **test mode** and not on the test list → skipped;
     else send the `pingboard_publish_reminder` template;
   - `claim_event_nudges(100, 24)` does the same for report reminders (expired after 24 h);
     report already complete / staff inactive → skipped; else send `pingboard_event_report`.
   - Errors: temporary (rate limit, 5xx) → retry next minute (max 4 attempts, still inside the
     lateness window); per-recipient (not on WhatsApp, …) → failed; setup problems (bad token,
     template missing) → the run stops and the WhatsApp page shows the reason in red.
5. Meta posts delivery receipts to **`/api/whatsapp/webhook`** (signature-checked with
   `META_APP_SECRET`) → `apply_wa_status()` records sent → delivered → read (never moves
   backwards), or failed with Meta's reason.

Marking a task **published** cancels its pending reminders; un-publishing or moving it into
the future revives them. Manual "Send now" (`enqueue_manual_reminder`) queues an offset-0
job that goes out on the next minute.

## Where to look

- **Admin → WhatsApp** (`/admin/whatsapp`): on/off, test mode + numbers, quiet hours, max
  lateness, test message, today's sent / delivered / read / failed / skipped (+ reasons),
  recent failures, setup checklist, template text to submit.
- **Admin → Reminders**: every job with status, delivery receipt, and skip/failure reason.
- SQL: `select status, skip_reason, count(*) from reminder_jobs where fire_at > now() - interval '1 day' group by 1,2;`
- `app_settings.last_whatsapp_run_*` — last run summary; `cron.job_run_details`, `net._http_response`.

## Pause / stop

- Normal: untick **Send WhatsApp messages** on the WhatsApp page (takes effect next minute).
- Hard stop: `select cron.unschedule('pingboard-whatsapp-send');`

## Database pieces (0030–0032)

`app_settings.whatsapp_*` + `last_whatsapp_run_*` · `reminder_jobs.skip_reason / delivery_status / delivery_at`
· `event_nudges` `sending` state + `attempts / claimed_at / wa_message_id / delivery_*` ·
`claim_due_reminders(limit, max_late_min)`, `skip_due_reminders(reason)`, `claim_event_nudges(limit, max_age_hours)`,
`apply_wa_status(message_id, status, at, error)` — all **service_role only** (they were callable by anyone
holding the anon key before 0030).
