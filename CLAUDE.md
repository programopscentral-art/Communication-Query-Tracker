# PingBoard — Communication Query Tracker

Internal ops tool for **NxtWave / NIAT**. It reminds each university's **BOAs** on
**WhatsApp** a set number of minutes before a scheduled communication's publish
time, so they never miss sending it. BOAs act in a per-university web board;
admins schedule, track, and monitor everything.

- **Product name:** PingBoard · **Org:** NxtWave (NIAT)
- **Repo:** https://github.com/programopscentral-art/Communication-Query-Tracker
- **Prod:** Vercel → https://communication-query-tracker.vercel.app (root dir = `web/`, region `bom1`)
- **DB/Auth:** Supabase Pro, project ref `tjhcfmquvsygttolrxxa`, region `ap-south-1` (Mumbai)
- **Scale target:** 300–500 (up to ~1–2k) daily users. Comfortable on this stack.

---

## Environment / tooling notes (READ FIRST)

- **The Bash tool is flaky in this environment** (spurious "unexpected EOF"). **Use the PowerShell tool** for shell/git/node, and dedicated tools (Read/Edit/Write/Grep) for files.
- **Windows** paths. `web/` is the Next.js app; the repo root has `scripts/`, `supabase/`, `docs/`.
- **This is Next.js 16** — middleware is renamed to **`proxy.ts`** (see `web/AGENTS.md`, auto-written by `next dev`). Don't recreate `middleware.ts`.
- **DB access from scripts:** direct host `db.<ref>.supabase.co:5432` does **not resolve** here; the **ap-south-1 session pooler** does. `scripts/db.mjs` tries both automatically.
- After **appending a server action** to a running `next dev`, **restart the dev server** (Turbopack's action manifest goes stale → "unexpected response" on form submit).
- LF→CRLF git warnings are harmless. `git push` via PowerShell prints git's progress on stderr (looks red) but succeeds — check the `main -> main` line.

## Secrets (NOT in this file — by design)

Secret **values** live only in git-ignored files + the Supabase/Vercel dashboards:
- `web/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SHEET_ID`, `NEXT_PUBLIC_STAFF_SHEET_ID`
- root `.env` — above + `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `GOOGLE_SHEET_ID`, `GOOGLE_STAFF_SHEET_ID`, `WHATSAPP_PROVIDER`
- ⚠️ The service_role key + DB password were pasted into chat during setup — **rotate them in the Supabase dashboard before/after go-live**, then update local `.env` + Vercel env.
- Vercel env (Production) needs the 4 `NEXT_PUBLIC_*` vars. The web app does **not** need the service_role key.

## Google resources

- **Tracker data sheet** (tasks): `1W6qHfLOP-moOd3sDEHuqRgrzTP6jdUTvLPOYho4AWOo`, tab **"Communication"** (gid `116249373`), ~6.9k rows.
- **Staff sheet** (BOAs): `1ip-V2pQmqUhsmcctpLUhuQW6I4f_iWkBVz9v0pXu2MY`.
- **Google OAuth client** lives in Google Cloud project `communication-query-tracker`; redirect URI = `https://<ref>.supabase.co/auth/v1/callback`. Supabase → Auth → URL config must list the Vercel + localhost URLs.

---

## Tech stack

Next.js 16 (App Router, RSC, server actions) + TypeScript + Tailwind v4, on Vercel ·
Supabase Postgres + Auth + RLS · framer-motion · `@supabase/ssr` · `xlsx` (sheet parse) ·
`pg` (scripts only). WhatsApp sender is provider-agnostic (mock → Meta/BSP).

## Repo layout

```
web/                     Next.js app (Vercel root dir)
  src/app/               routes (admin/*, u/[code]/*, login, auth/callback, blocked)
  src/components/        UI (TopNav, Footer, ViewTabs, DynamicSelect, …)
  src/lib/               auth, supabase clients, time, format, sheetSync, activity
  public/                niat-logo.png (full), niat-shield.png (nav mark)
supabase/migrations/     0001–0020 SQL (source of truth for schema)
supabase/functions/      send-reminders edge function + _shared providers/message
scripts/                 db.mjs, db-push.mjs, import-tracker.mjs, import-staff.mjs, discover-gids.mjs
docs/                    SYSTEM_DESIGN, AUTH_SETUP, REMINDER_ENGINE, BOA_INTAKE_FORMAT, templates/
```

---

## Data model (see `supabase/migrations/` for exact DDL)

- **universities** (`id, name, code, aliases[], timezone, go_live_date, active`) — `code` used in `/u/<code>` + as the dedup key for sheet universities.
- **boas** (`id, employee_id UNIQUE, name, designation, whatsapp_e164, email, active, source_row, source_gid`) — staff. `employee_id` is the stable sync key.
- **university_boas** (`university_id, boa_id, role[primary|backup], team_scope, receive_reminders, effective_*`) — assignment (PK incl team_scope).
- **escalation_contacts**, **app_users** (`id→auth.users, role[admin|boa], boa_id, full_name, email, can_view_admin`).
- **tasks** — one comm per row: `team, entry_date, update_type, category, priority (text), university_id, channel, content_type, target_audience, message_content, poster_drive_link, publish_at (UTC), special_instructions, execution_status (enum), actual_publish_date, issue_blocker, reminder_offsets_min[], source_key UNIQUE, source_row, source_gid, origin[sheet|ui], created_source_by`.
- **reminder_jobs** (`task_id, boa_id, offset_min, fire_at, status[pending|sending|sent|failed|skipped|cancelled], attempts, claimed_at, …`) UNIQUE(task_id,boa_id,offset_min).
- **reminder_prefs** (`university_id, offsets_min[], auto_enabled`), **app_settings** (`data_source_mode[sheet|ui], default_reminder_offsets_min, allowed_domain`).
- **tickets** (subject, description, status, priority, tags[], link, raised_by(+name/email), assigned_to(+name/email)), **announcements**, **internal_messages**, **admin_emails**, **audit_log**, **ref_*** dropdown tables.
- Views: `task_status_by_university`, `v_university_history`, `v_staff_activity`, `v_recent_activity`, `reminder_job_details` (all `security_invoker=on`).
- RPCs: `existing_task_source_keys`, `existing_task_sync_state`, `enqueue_manual_reminder`, `university_quick_stats`, `claim_due_reminders`, `generate_reminder_jobs`, …

### Migrations (0001–0020, applied to live DB)
0001 schema · 0002 auth(domain-lock trigger) · 0003 RLS · 0004 reminder engine · 0005 seed(18 unis + dropdowns) · 0006 views · 0007 reminder_prefs+precedence+manual-send · 0008 history(audit trigger+views) · 0009 tickets+announcements · 0010 admin_view_access(can_view_admin) · 0011 sheet_refs(source_row/gid on tasks) · 0012 staff_directory(app_users.email, co-worker RLS, boas sheet refs) · 0013 ui_authoring(ref tables, priority→text, data_source_mode, origin) · 0014 ticket_meta(raiser/assignee) · 0015 autolink_boa(link app_users↔boas by email) · 0016 reminder_view fire_at · 0017 regen_on_assignment(generate reminders when staff assigned) · 0018 existing_keys_rpc · 0019 sync_state_rpc · 0020 task_edit_delete_audit.

**Apply a migration:** PowerShell → `node --input-type=module -e "import {connect} from './scripts/db.mjs'; import {readFileSync} from 'node:fs'; const c=await connect(); await c.query(readFileSync('supabase/migrations/00XX_*.sql','utf8')); await c.end();"` (or `npm run db:push` for all). Migrations were applied directly to the live DB throughout; `supabase db push`/CLI link was never used (no access token).

---

## Auth & access (domain-locked)

- Google SSO restricted to **@nxtwave.co.in**, enforced 3 ways: Google consent (Internal), `web/src/lib/supabase/middleware.ts` (proxy) + `auth/callback`, and DB trigger `handle_new_user` (0002/0012) that rejects other domains + provisions `app_users` (role from `admin_emails`, `boa_id` matched by email).
- Helpers in `web/src/lib/auth.ts`: `requireAppUser()` (cached), `requireAdmin()` (admin **or** `can_view_admin`), `requireUniversityAccess(code)` (strict — BOA can only open their own uni), `hasAdminAccess()`.
- **Admin** = email in `admin_emails` (role admin) or granted via **Staff → Admin Access** tab. Primary admin: `nalamasa.sanjay@nxtwave.co.in`.
- **Isolation:** RLS scopes BOAs to their university everywhere; admins see all. `internal_messages` admin-only.
- `0015` + `0017` triggers auto-link accounts to staff (by email) and auto-generate reminders when staff are (re)assigned — so onboarding order doesn't matter.

## Reminder engine

`generate_reminder_jobs(task)` precomputes `reminder_jobs` (fire_at = publish_at − offset) for each eligible BOA (assignment + `receive_reminders` + team_scope match), offsets precedence **task → university pref → global {15,10}**. Fires on task write, on assignment change, and on prefs change. `claim_due_reminders()` uses `FOR UPDATE SKIP LOCKED` (no double-send). The **`send-reminders` edge function** drains due jobs via the provider. Manual "Send now" → `enqueue_manual_reminder`. **Reminders only exist when a university has an assigned active BOA.**

⚠️ **Cron not scheduled yet** and **provider = mock** — see `docs/REMINDER_ENGINE.md` to go live (deploy the edge function, set provider secrets, register the WhatsApp template, schedule the 1-min `pg_cron` → edge call).

## Data source (Sheet ⇄ UI)

- **Source tab** (`/admin/data-source`) toggles `data_source_mode`: **sheet** (import authoritative, Sheet wins on dup) or **ui** (author in-app, import paused).
- **Sync now** button (Sheet mode only) → server action `syncSheetNow` → `web/src/lib/sheetSync.ts`: fetches the sheet, dedups by **`source_key`** = `sha1(uniName|publish_at|channel|content_type|message[:120])`, **inserts only new rows**, **updates status/actual/issue on existing rows** (Sheet wins), drops UI duplicates. Never overwrites other content of existing rows; keeps it fast (delta only).
- Editing key fields in the sheet makes a **new** row (new source_key); editing non-key/non-outcome fields on existing rows is **not** synced (use UI mode / the in-app Edit for that).
- **View in Sheet** deep-links (`…/edit#gid=<source_gid>&range=A<source_row>`) — needs `NEXT_PUBLIC_SHEET_ID`.
- Bulk load scripts: `node scripts/import-tracker.mjs --commit`, `node scripts/import-staff.mjs --commit` (idempotent; staff keyed by employee_id; phones normalized to +91).

## Features / routes

- **Admin** (`/admin/*`): Overview (stats), ＋New (author task, multi-university fan-out, dynamic add-new dropdowns), Schedule (Yesterday/Today/Upcoming + uni filter), Tasks, Source (mode + Sync now), Staff (+ new/edit, Admin Access tab), Tickets (triage + tag), Reminders (Today/Tomorrow/Upcoming + date search + uni filter), History (university/staff audit incl edits & deletes), Comms (internal messages), Announcements.
- **University** (`/u/[code]/*`): Board (reminder-timing control, Yesterday/Today/Upcoming), Team (co-workers), My Reminders, Tickets. Announcement bar (per-uni live stats + promos). Task detail: status update, Send-now, View-in-Sheet, and **admin-only Edit/Delete** (audited).
- Login (`/login`), `/blocked`, global `error.tsx`.

## Conventions

- **Timezone:** store UTC, display **Asia/Kolkata**. `lib/time.ts` (istWindow/dateWindow) + `lib/format.ts` (fmtIST, utcToIstLocalInput). India has no DST.
- **Reveal animations** animate **on mount** (not whileInView — that left content blank on nav). **Don't** per-row stagger big lists (board/schedule render plain rows).
- **Server actions** in `web/src/app/actions.ts`. User-facing errors use `useActionState` returning `{error}` (never throw → white screen); DB unique violations mapped to friendly text.
- Tailwind design tokens: `ink, muted, line, canvas, surface, accent, accent-soft, success, warn, danger`. Fonts: `font-display`, `font-ui`.
- Logos in `public/`: `niat-logo.png` (full, login+footer), `niat-shield.png` (nav mark, cropped x=0..240 of the full logo — transparent bg).

## Run / build / deploy

```bash
cd web && npm run dev          # localhost:3000 (uses web/.env.local → live Supabase)
cd web && npm run build        # production build (verify before pushing)
cd web && npx tsc --noEmit     # typecheck
```
- **Vercel:** import root dir = `web`, preset Next.js, `regions:["bom1"]` (in `web/vercel.json`), set the 4 `NEXT_PUBLIC_*` env vars. Push to `main` → auto-deploy.
- After OAuth/URL changes, update **Supabase → Auth → URL Configuration** (Site URL + `…/**` redirects) or login breaks.
- **Hard-reload (Ctrl+Shift+R)** after shipping server-action/logo changes.

## Verifying DB behavior

Prefer a throwaway script under `scripts/_*.mjs` run via PowerShell: simulate the admin session by `set_config('request.jwt.claims', …)` + `set local role authenticated` inside a transaction, assert, then `ROLLBACK`. Delete the script after. (Used all session to verify RLS, reminders, sync idempotency, edit/delete audit.)

---

## Current data facts

- ~20 universities (18 seeded + JOY (Chennai); staff-sheet full names aliased to seeded codes; all Yenepoya spellings merged). ~6,936 tasks imported. 74 staff imported (4 skipped — blank phone numbers). Test unis "Testing University" (staff: Ravi) and "Central Testing".

## Outstanding / TODO (not done yet)

1. **WhatsApp go-live** — provider (Meta/BSP) + approved template + schedule the 1-min cron (`docs/REMINDER_ENGINE.md`). Currently mock.
2. **Scheduled auto-sync** — so the sheet flows in without clicking Sync now (currently manual button / CLI).
3. **Vercel Hobby → Pro** before real rollout (ToS + usage caps + cold starts).
4. **Rotate** the exposed Supabase service_role key + DB password.
5. Fill WhatsApp numbers for the 4 skipped staff, then re-run staff import.
6. Nice-to-haves: favicon from the shield; Edit/Delete from Schedule rows; realtime board updates; full content two-way sheet sync; pagination/virtualization for "All time".
