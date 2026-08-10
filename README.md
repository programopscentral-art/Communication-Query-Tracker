# Communication Query Tracker

Reminder + tracking system for university BOAs. The Communication team schedules
updates (WhatsApp / App posts) per university; the system sends WhatsApp reminders
to the responsible BOAs **N minutes before** each item's publish time, the BOAs
complete the work in a per-university web UI, and Admins monitor progress + hold
internal communication.

## Architecture

```
Comms Team ──enters rows──▶  Supabase Postgres (source of truth)
                                   │
        ┌──────────────────────────┼─────────────────────────┐
        ▼                          ▼                          ▼
  Reminder engine            BOA University UI          Admin UI
 (pg_cron + job queue)       (Next.js, per-uni)        (track + internal comms)
        │
        ▼
  WhatsApp Business API ─▶ BOA phone ─▶ deep link into BOA UI
```

- **DB / Auth / Realtime / Cron:** Supabase (Postgres 15, pg_cron, RLS)
- **Web:** Next.js (App Router) — role-gated BOA + Admin UIs
- **Reminders:** trigger precomputes `reminder_jobs`; `pg_cron` drains due jobs every minute using `FOR UPDATE SKIP LOCKED` (idempotent, parallel-safe)
- **WhatsApp:** provider-agnostic interface (mock → Meta Cloud API / BSP)

## Layout

```
supabase/
  migrations/          SQL migrations (schema, RLS, reminder engine, seed)
  functions/           Edge Functions (send-reminders drainer)
scripts/               Sheet import + ops scripts
web/                   Next.js app (BOA + Admin UIs)
.env.example           Environment template
```

## Getting started

See `docs/SETUP.md` (created during scaffolding). Short version:

```bash
# 1. link a Supabase project and push migrations
npx supabase link --project-ref <ref>
npx supabase db push

# 2. import the existing sheet
node scripts/import-sheet.mjs

# 3. run the web app
cd web && npm install && npm run dev
```
