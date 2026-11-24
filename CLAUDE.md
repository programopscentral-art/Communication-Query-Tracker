# PingBoard — Communication Query Tracker

Internal ops tool for **NxtWave / NIAT**. It reminds each university's **BOAs** on
**WhatsApp** a set number of minutes before a scheduled communication's publish
time, so they never miss sending it. BOAs act in a per-university web board;
admins schedule, track, and monitor everything.

- **Product name:** PingBoard · **Org:** NxtWave (NIAT)
- **Repo:** https://github.com/programopscentral-art/Communication-Query-Tracker
- **Prod:** Vercel → https://communication-query-tracker.vercel.app (root dir = `web/`, region `bom1`, team **Central-Team** on the **Pro** plan)
- **DB/Auth:** Supabase Pro, project ref `tjhcfmquvsygttolrxxa`, region `ap-south-1` (Mumbai)
- **Scale target:** 300–500 (up to ~1–2k) daily users. Comfortable on this stack.

---

## Working with this user (READ FIRST)

- Flow for every change: **build → run on localhost → user checks → user says "push" → push.** Never push without that go-ahead.
- Scope tightly: when asked for one thing ("just the logo", "only the date sorting"), change nothing else. Big features: explain the design + edge cases first, then build.
- When something breaks, find and explain the **root cause** (reproduce it), then fix it. Show user-facing errors as clear inline messages, never the crash page.
- The user tests on **production** too — remember prod only changes after a push + Vercel deploy.
- After a push, check the deploy (GitHub commit status API, see below) and report it. When asked to "update claude.md", keep **this file** as the single store of project context (memory notes only point here).
- Claude can't change Google Drive sharing or create Supabase / Google Cloud / Vercel credentials or settings — the user does those in the consoles (`docs/AUTH_SETUP.md`); give exact click-paths.
- Never edit either Google Sheet — PingBoard only **reads** them.

## Environment / tooling notes

- **The Bash tool is flaky here** (spurious "unexpected EOF"). **Use PowerShell** for shell/git/node, and Read/Edit/Write/Grep for files. Watch PowerShell quoting (avoid `"` inside `Select-String -Pattern "…"`; prefer single quotes).
- **Windows** paths. `web/` is the Next.js app; the repo root has `scripts/`, `supabase/`, `docs/`.
- **Next.js 16** — middleware is renamed to **`proxy.ts`** (see `web/AGENTS.md`, auto-written by `next dev`). Don't recreate `middleware.ts`.
- **DB access from scripts:** direct host `db.<ref>.supabase.co:5432` does **not resolve**; the **ap-south-1 session pooler** does. `scripts/db.mjs` tries both.
- **Restart `next dev`** after appending/changing a server action's signature (stale action manifest → "unexpected response"), and after running `npm run build` (both use `.next`).
- **Pushing:** GitHub auth goes through Git Credential Manager, which can't prompt from this shell (`could not read Username … terminal prompts disabled`). Commit locally, then ask the user to run `git push origin main` in **their** terminal. Verify the deploy with `https://api.github.com/repos/programopscentral-art/Communication-Query-Tracker/commits/<sha>/status` → `Vercel: success`.
- Before every commit, scan the staged diff for secrets (the CRON_SECRET value, Supabase JWT keys — they begin with "eyJ" — and the DB password from root `.env`). LF→CRLF warnings are harmless; git's push progress on stderr looks red but check for `main -> main`.
- **Testing TS modules without Next:** Node 24 runs `.ts` directly. Stub `server-only` and resolve extensionless relative imports with a tiny `module.register` loader hook (keep it in the scratchpad), e.g. `node --import file:///…/register.mjs test.mjs`. Used for `outcomePatch` and `adminEmailProblem` tests.

## Secrets (NOT in this file — by design)

Secret **values** live only in git-ignored files + the Supabase/Vercel dashboards:
- `web/.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SHEET_ID`, `NEXT_PUBLIC_STAFF_SHEET_ID`, plus server-only `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (for testing `/api/cron/sync-sheet` locally)
- root `.env` — above + `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `GOOGLE_SHEET_ID`, `GOOGLE_STAFF_SHEET_ID`, `WHATSAPP_PROVIDER`, `CRON_SECRET`
- **Vercel env (Production, all set):** the `NEXT_PUBLIC_*` vars + **server-only** `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`. Never give those two a `NEXT_PUBLIC_` prefix. Env changes need a **Redeploy** to take effect.
- **WhatsApp (Vercel, server-only, set by the user — see `docs/WHATSAPP_SETUP.md`):** `WHATSAPP_PROVIDER=meta`, `META_WABA_PHONE_NUMBER_ID`, `META_WABA_TOKEN`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; optional `META_TEMPLATE_LANG` (default `en`), `META_TEMPLATE_REMINDER`/`META_TEMPLATE_EVENT` (default `pingboard_publish_reminder`/`pingboard_event_report`), `META_TEMPLATE_URL_BUTTON` (`on`), `META_GRAPH_VERSION` (`v23.0`). Without them the provider is **mock** (logs only). Localhost has none → mock.
- `CRON_SECRET` exists in 4 places: root `.env`, `web/.env.local`, Vercel, and Supabase **Vault** (`pingboard_cron_secret`). To rotate: change it in `.env` → `node scripts/set-cron-secret.mjs` → update Vercel + `web/.env.local` → redeploy.
- ⚠️ The service_role key + DB password were pasted into chat during setup — **rotate them** in Supabase, then update root `.env`, `web/.env.local`, and Vercel.

## Google resources

- **Tracker data sheet** (tasks): `16-e4LMiOMZxMenVMrDAIDBX651j4MxEJN3y2WihjUeg` — the comms team's **official** live sheet (replaced the old `1W6qHfLOP…` copy on 2026-08-13). Only tab **"Communication"** (gid `116249373`) is used: ~16.7k grid rows, ~10.1k real data rows. Other tabs (pivots, date-range snapshots, "Query", "Detail7-…") are ignored.
- ⚠️ In that tab the **University column (F) header was overwritten as a second "Priority"** (Sep 2026). The importer copes (content detection), but ask the comms team to rename it back to "University".
- **Staff sheet** (BOAs, "University BOAs List — Intake Template", owned by programopscentral@nxtwave.in): `1ip-V2pQmqUhsmcctpLUhuQW6I4f_iWkBVz9v0pXu2MY` — historical only; staff are now managed **in-app**. Its flat format (one row per BOA × University, `docs/BOA_INTAKE_FORMAT.md`): Employee ID (stable key), Full Name, Designation, WhatsApp Number (+91 E.164), Login Email, University, Role (Primary/Backup), Team Scope (All/Student Engagement/Parent Communication), Receive Reminders (Yes/No), Status (Active/Inactive).
- **Old tracker sheet** `1W6qHfLOP-moOd3sDEHuqRgrzTP6jdUTvLPOYho4AWOo` — retired 2026-08-13, don't reconnect.
- **Login domain is `@nxtwave.co.in`** (note `.co.in`); the ops Google account `programopscentral@nxtwave.in` owns the sheets/Drive files but is not an app login.
- **Google OAuth client** lives in Google Cloud project `communication-query-tracker`; redirect URI = `https://<ref>.supabase.co/auth/v1/callback`. Supabase → Auth → URL config must list the Vercel + localhost URLs.

---

## Tech stack

Next.js 16 (App Router, RSC, server actions) + TypeScript + Tailwind v4, on Vercel ·
Supabase Postgres + Auth + RLS + pg_cron + pg_net + Vault · framer-motion · `@supabase/ssr` ·
`xlsx` (sheet parse) · `pg` (scripts only). WhatsApp sender is provider-agnostic (mock → Meta/BSP).

## Repo layout

```
web/                          Next.js app (Vercel root dir)
  src/app/                    routes (admin/*, u/[code]/*, login, auth/callback, blocked)
  src/app/api/cron/           sync-sheet · sync-events · event-nudges · send-whatsapp (CRON_SECRET bearer, lib/cronAuth.ts)
  src/app/api/whatsapp/webhook  Meta delivery receipts (public path; X-Hub-Signature-256 checked with META_APP_SECRET)
  src/app/admin/whatsapp/     WhatsApp control page (switch, test mode, quiet hours, test send, stats, templates)
  src/app/whatsapp-actions.ts WhatsApp server actions
  src/app/admin/events/       Event Reports hub, new, [id], export (route.ts → xlsx/csv)
  src/app/u/[code]/events/    staff Event Reports list + [id] report form
  src/app/events-actions.ts   Event server actions (separate "use server" file)
  src/app/icon.png            favicon (NIAT shield, 256×256)
  src/components/             UI (TopNav, Footer, ViewTabs, DateSearch, UniSelect, ParamSelect, ReadOnlyNotice,
                              StaffRowActions, events/EventForms + EventBits, …)
  src/lib/                    auth, supabase/{server,client,middleware,admin}, time, format, sheetSync,
                              eventSync, eventNudges, eventQueries, eventOptions, events, adminEmail, cronAuth,
                              whatsapp (Meta client + error map), whatsappMessages (template text + params), whatsappSender
  public/                     niat-logo.png (full), niat-shield.png (nav mark)
supabase/migrations/          0001–0032 SQL (source of truth for schema)
scripts/                      db.mjs, db-push.mjs, import-tracker.mjs, import-staff.mjs,
                              discover-gids.mjs, set-cron-secret.mjs
docs/                         SYSTEM_DESIGN, AUTH_SETUP, REMINDER_ENGINE, WHATSAPP_SETUP, BOA_INTAKE_FORMAT, templates/
```

---

## Data model (see `supabase/migrations/` for exact DDL)

- **universities** (`id, name, code, aliases[], timezone, go_live_date, active`) — `code` used in `/u/<code>`; name/code/aliases resolve sheet university names.
- **boas** (`id, employee_id UNIQUE, name, designation, whatsapp_e164 UNIQUE + E.164 check, email, active, source_row, source_gid`) — staff.
- **university_boas** (`university_id, boa_id, role[primary|backup], team_scope, receive_reminders, effective_*`) — assignment (PK incl team_scope).
- **app_users** (`id→auth.users, role[admin|boa], boa_id, full_name, email, can_view_admin`), **admin_emails** (`email, level[admin|viewer]` — allowlist applied at first sign-in), **escalation_contacts**.
- **events** — Event Reports (one row per event): provenance (`origin, sheet_key UNIQUE, fingerprint UNIQUE, source_tab/gid/row, sheet_seen jsonb, sheet_missing_since`), `period` (month), `event_date/end_date/date_text/event_last_day(generated)`, **details** (university_id/raw, conducted_by, cma_assigned, category, subcategory, title, coverage, duration, mode, zoho_status, admin_comments) and **report** (description, registrations, participants, feedback_rate, avg_rating, feedback, highlights, improvements, photos/registration/feedback/recording links), `report_filled` (generated 0–7), created/updated/report_updated by+at. Trigger `events_guard`: staff may change ONLY report columns.
- **event_nudges** (`event_id, boa_id, stage[due|overdue], status[queued|sent|failed|skipped], whatsapp_e164, message`) UNIQUE(event_id, stage, boa_id).
- **tasks** — one comm per row: `team, entry_date, update_type, category, priority (text), university_id, channel, content_type, target_audience, message_content, poster_drive_link, publish_at (UTC), special_instructions, execution_status (enum execution_status), actual_publish_date, issue_blocker, reminder_offsets_min[], source_key UNIQUE, source_row, source_gid, origin[sheet|ui], created_source_by, updated_at`.
- **task_sheet_state** (`source_key PK → tasks.source_key ON DELETE CASCADE, status, actual, issue, seen_at`) — what the SHEET last showed per row (for the three-way merge). Separate table so maintaining it never bumps `tasks.updated_at`, writes audit rows, or regenerates reminders.
- **reminder_jobs** (`task_id, boa_id, offset_min, fire_at, status[pending|sending|sent|failed|skipped|cancelled], attempts, claimed_at, wa_message_id, error, skip_reason, delivery_status[sent|delivered|read|failed], delivery_at, …`) UNIQUE(task_id,boa_id,offset_min). `event_nudges` has the same sender columns (+ `sending` status).
- **reminder_prefs** (`university_id, offsets_min[], auto_enabled`), **app_settings** (`data_source_mode[sheet|ui], default_reminder_offsets_min, allowed_domain, last_sheet_sync_*, events_sheet_id, last_event_sync_*, event_nudge_enabled/after_days/escalate_after_days/lookback_days, last_event_nudge_*`).
- **tickets**, **announcements**, **internal_messages**, **audit_log**, **ref_*** dropdown tables.
- Views: `task_status_by_university`, `v_university_history`, `v_staff_activity`, `v_recent_activity` (actor falls back to "System"), `reminder_job_details`, and for events `v_event_month_stats`, `v_event_overdue`, `v_event_options`, `v_event_campus_names`, `v_event_date_issues`, `v_event_duplicate_keys` (all `security_invoker=on`, so RLS applies). Use these instead of fetching rows — PostgREST caps plain selects at 1000 rows.
- RPCs: `existing_task_sync_state` (admin or service_role), `existing_task_source_keys`, `enqueue_manual_reminder`, `university_quick_stats`, `claim_due_reminders`, `generate_reminder_jobs`, …
- FK delete rules on `boas`: `university_boas` CASCADE, `reminder_jobs` CASCADE, `app_users.boa_id` SET NULL.
- Triggers on `tasks` UPDATE: `set_updated_at` (History "last activity" reads it), `audit_task_change_trg` (outcome + content fields only), `tasks_reminder_sync_trg` (only on publish_at/university/team/status/offsets).

### Migrations (0001–0032)
0001 schema · 0002 auth(domain-lock trigger) · 0003 RLS · 0004 reminder engine · 0005 seed(18 unis + dropdowns) · 0006 views · 0007 reminder_prefs+precedence+manual-send · 0008 history(audit trigger+views) · 0009 tickets+announcements · 0010 admin_view_access(can_view_admin) · 0011 sheet_refs · 0012 staff_directory · 0013 ui_authoring(ref tables, priority→text, data_source_mode, origin) · 0014 ticket_meta · 0015 autolink_boa · 0016 reminder_view fire_at · 0017 regen_on_assignment · 0018 existing_keys_rpc · 0019 sync_state_rpc · 0020 task_edit_delete_audit · 0021 sheet_auto_sync (`task_sheet_state` + backfill, RPC allows service_role, `last_sheet_sync_*`) · 0022 schedule_sheet_sync (pg_cron job `pingboard-sheet-sync`, applied 2026-09-28) · 0023 read_only_admin (`has_admin_read()` + `*_viewer_read` SELECT policies on 13 tables, `admin_emails.level`, sign-up honours level) · 0024 events (table, guard trigger, RLS, events settings, campus aliases) · 0025 event_views · 0026 campus_name_fixes (Takshasila→"Takshashila"; all Chevella spellings → NIAT-Chevella; CIET → Chalapathy) · 0027 schedule_event_sync (`pingboard-event-sync`, applied 2026-09-30) · 0028 event_nudges (`event_last_day`, nudge settings + table, `v_event_overdue`) · 0029 schedule_event_nudges (`pingboard-event-nudges`, applied 2026-09-30) · 0030 whatsapp_sender (settings, lateness-guarded claims, delivery receipts, revive-on-reschedule, sender functions locked to service_role; **applied 2026-10-27**, retired the 4,236-job backlog) · 0031 reminder_triggers_definer (**bug fix: staff task updates failed under RLS** — reminder triggers now SECURITY DEFINER; **applied 2026-11-24**: a rolled-back staff simulation was rejected with the RLS error before and accepted after; task/reminder/audit counts identical before vs after; rollback SQL + snapshot saved in `C:\Users\Asus\Documents\PingBoard-backups\`) · 0032 schedule_whatsapp_sender (`pingboard-whatsapp-send` every minute; **not applied — apply only after the Meta keys are in Vercel and a test message from Admin → WhatsApp has worked**, per `docs/WHATSAPP_SETUP.md`).

**Apply a migration:** a small node script using `connect()` from `scripts/db.mjs` + `readFileSync` of the `.sql` (or `npm run db:push` for all). Migrations were always applied directly to the live DB; the Supabase CLI was never linked. Before applying, check which triggers the change fires (see above) so a backfill doesn't flood History or regenerate reminders.

---

## Auth & access (domain-locked)

- Google SSO restricted to **@nxtwave.co.in**, enforced 3 ways: Google consent (Internal), `lib/supabase/middleware.ts` (proxy) + `auth/callback`, and DB trigger `handle_new_user` (0002/0012) that rejects other domains + provisions `app_users` (role from `admin_emails`, `boa_id` matched by email).
- Public (no-login) paths in `middleware.ts`: `/login`, `/auth`, `/blocked`, `/api/cron` (self-authorizes with CRON_SECRET), `/api/whatsapp/webhook` (Meta signature).
- Helpers in `lib/auth.ts`: `requireAppUser()` (cached), `requireAdmin()` (full **or** read-only admin — for pages), `requireWriteAdmin()` (full admin only — use in every admin **write** action; throws `READ_ONLY_MESSAGE`), `isFullAdmin()`, `isReadOnlyAdmin()`, `hasAdminAccess()`, `requireUniversityAccess(code)` → `{...user, canEdit}` (cached; full admins + that university's staff can edit; read-only admins may **view** any board).
- **Two admin levels:**
  - **Full admin** (`role = 'admin'`): everything. DB `is_admin()` is true only for these, so RLS writes are full-admin-only.
  - **Read-only admin** (`role = 'boa'` + `can_view_admin`): sees everything a full admin sees (DB `has_admin_read()` read policies on all admin tables), can't create/update/delete. UI hides every write control (`ReadOnlyNotice`, disabled fieldsets); nav label "Admin · Read-only". If they're also university staff they keep full rights on their own board. Granted from the Admin Access tab (level "Read-only admin") or the toggle on a staff member's page.
- **Admin Access tab** (`/admin/access`): full admins grant **Full** or **Read-only** by email (invite stored with `level`; applied at first sign-in, or immediately if they've signed in). Lists full admins, read-only admins, and invites. `grantAdmin`/`revokeAdmin` return `{tone, title, detail}`; email checks in `lib/adminEmail.ts`.
- Current: full admins `nalamasa.sanjay@`, `pravalika.s@` (+ `bogada.chandrakanth@`, `pratik.rao@` invited/added); `perisetti.sunil@` = read-only admin + NIAT-Chevella staff.
- **Isolation:** RLS scopes BOAs to their university everywhere; admins see all. `internal_messages` admin-only.
- `0015` + `0017` triggers auto-link accounts to staff (by email) and auto-generate reminders when staff are (re)assigned.

## Reminder engine

`generate_reminder_jobs(task)` precomputes `reminder_jobs` (fire_at = publish_at − offset) for each eligible BOA (assignment + `receive_reminders` + team_scope match), offsets precedence **task → university pref → global {15,10}**. Fires on task write, assignment change, and prefs change. Marking a task **published cancels its pending reminders**; un-publishing / rescheduling into the future revives cancelled or skipped ones. Manual "Send now" → `enqueue_manual_reminder`. **Reminders only exist when a university has an assigned active BOA.**

**WhatsApp sender** (`lib/whatsappSender.ts` via `/api/cron/send-whatsapp`; full flow in `docs/REMINDER_ENGINE.md`): master switch `app_settings.whatsapp_enabled` (default **off**) · **test mode** (default on; only `whatsapp_test_numbers` receive) · **quiet hours** 22:00–08:00 IST (due reminders skipped, not delayed) · `claim_due_reminders(limit, max_late_min)` skips anything > 5 min late (so no backlog blast) and claims with `SKIP LOCKED` · skips published tasks / complete reports / inactive staff · temporary Meta errors retry (max 4), per-recipient errors fail, setup errors (bad token, missing template) stop the run and show red on Admin → WhatsApp · report reminders (`claim_event_nudges`) expire after 24 h · receipts via the webhook → `apply_wa_status` (sent → delivered → read, never backwards). Templates' exact text lives in `lib/whatsappMessages.ts` (`TEMPLATE_TEXT`) — change the code and the Meta template together.
- Meta helpers: `lib/whatsapp.ts` (`waConfig`, `sendTemplate`, `WaError{permanent,fatal}` with a plain-English map of Meta error codes, `cleanParam` — Meta rejects params with new lines / tabs / >4 spaces).
- ⚠️ **Status (2026-11-24):** code built + tested 2026-10-27 (45 unit/simulation checks, 14 rolled-back SQL checks, 6 webhook checks), **committed + deployed 2026-11-24** (commit `5cbd5ae`, Vercel success; live webhook answers 403 to unsigned requests, sender route 401 without CRON_SECRET). **0031 applied**; **0032 not applied** (waits for Meta keys + a working test message). Provider still **mock** until the user finishes `docs/WHATSAPP_SETUP.md`; switch is **off**; test mode on with **no test numbers** yet.
- **Stale backlog:** 1,016 `pending` reminder_jobs (all with past `fire_at`, accumulated since 0030 retired the first 4,236) will **not** be sent: on the first sender run they're marked skipped ("Too late", or "Quiet hours" if run 22:00–08:00 IST). Queued event_nudges older than 24 h expire the same way — but nudges queued in the last 24 h (new batch daily 10:00 IST) **can** send on the first run, so keep test mode on until go-live.

## Data source (Sheet ⇄ UI)

- **Source tab** (`/admin/data-source`) toggles `data_source_mode`: **sheet** (Sheet is source of truth) or **ui** (author in-app, sheet sync paused). It also shows **"Last sync: X ago · automatic/manual"** + the result, or a red failure.
- **Auto-sync (LIVE since 2026-09-28):** Supabase `pg_cron` job `pingboard-sheet-sync` runs `*/10 * * * *` → `pg_net` `GET /api/cron/sync-sheet` with `Authorization: Bearer <Vault pingboard_cron_secret>`. The route (`app/api/cron/sync-sheet/route.ts`) uses the service-role client (`lib/supabase/admin.ts`), skips in UI mode, runs `runSheetSync`, and records `last_sheet_sync_*`. 401 without the right token; 500 "not configured" if Vercel lacks CRON_SECRET.
  - Why pg_cron: chosen when the project was on Vercel Hobby (cron only once a day). Each run ≈ 7–9 s wall, ~2.5 s CPU → every 10 min ≈ 3 CPU-h/month. The team is now on **Pro**, so `*/5` is possible (needs a migration that re-schedules `pingboard-sheet-sync`).
  - Pause: `select cron.unschedule('pingboard-sheet-sync');` · Inspect: `cron.job`, `cron.job_run_details`, `net._http_response`.
- **Sync now** button (Sheet mode) → `syncSheetNow` → same `runSheetSync`, recorded as "manual".
- **`runSheetSync` (`lib/sheetSync.ts`):**
  - Downloads the xlsx export (45 s timeout) + htmlview gid map in parallel; parses **only the "Communication" tab** with `sheets: "Communication", dense: true`.
  - Columns found by header name; if the University header is missing/renamed, it's **detected by content** (column whose values are mostly known universities). Missing tab/columns → loud error, never a silent fallback to another tab.
  - Dedups by **`source_key`** = `sha1(uniName|publish_at_iso|channel|content_type|message[:120])`; inserts only new rows; auto-creates unknown universities; drops UI duplicates (Sheet wins).
  - **Three-way outcome merge** (`outcomePatch`): for Status / Actual date / Issue, a sheet value is applied only if the **sheet** changed since last run (per field, vs `task_sheet_state`). A BOA's in-app update is **kept** while the sheet row is unchanged; if both changed, the sheet wins. Rows with no memory yet → sheet wins.
  - The sync is **one-way (Sheet → app)**: BOA updates are never written back to the sheet.
- Editing a key field in the sheet (message start, publish time, channel, content type, university) makes a **new** row; the old one stays. Other non-outcome fields on existing rows are not synced.
- **Never switch to the CSV export:** its `\n` line breaks differ from xlsx `\r\n`, which changes ~676 source_keys → mass duplicates.
- **View in Sheet** deep-links (`…/edit#gid=<source_gid>&range=A<source_row>`) — needs `NEXT_PUBLIC_SHEET_ID`.
- CLI `node scripts/import-tracker.mjs [--commit]` does the same parsing (Communication-only + content detection) for bulk loads; it inserts + refreshes row refs but doesn't write `task_sheet_state` (the sync's no-memory fallback covers that).
- **Staff are managed in-app** now — don't run `scripts/import-staff.mjs` (it would overwrite in-app staff edits from the old staff sheet).

## Scheduled jobs (Supabase pg_cron → Vercel, all LIVE)

| pg_cron job | Schedule (UTC) | Endpoint | Does |
|---|---|---|---|
| `pingboard-sheet-sync` | `*/10 * * * *` | `/api/cron/sync-sheet` | Communication sheet → tasks |
| `pingboard-event-sync` | `3,18,33,48 * * * *` | `/api/cron/sync-events` | Event Reports sheet → events |
| `pingboard-event-nudges` | `30 4 * * *` (10:00 IST) | `/api/cron/event-nudges` | queue reminders for overdue reports |
| `pingboard-whatsapp-send` *(0032, not yet scheduled)* | `* * * * *` — but only calls Vercel when the switch is on **and** something is due | `/api/cron/send-whatsapp` | send due WhatsApp reminders |

- Each job calls `net.http_get` with `Authorization: Bearer <Vault pingboard_cron_secret>`; routes check it with `refuseCron()` (`lib/cronAuth.ts`), use the service-role client, and record `last_*_sync_*` / `last_event_nudge_*` in `app_settings` (shown on the Source / Events pages).
- **Adding a job:** new route under `app/api/cron/` using `refuseCron` → a migration that `cron.schedule(...)`s the prod URL → push → **apply the migration only after the deploy is live** (otherwise it 404s every run) → fire it once from SQL and read `net._http_response` to confirm a 200.
- Pause one: `select cron.unschedule('<jobname>');` · Inspect: `cron.job`, `cron.job_run_details`, `net._http_response`.

## Event Reports (`/admin/events`, `/u/[code]/events`)

- **Source:** Event Reports Google Sheet `1yFsv37DB3xevKH2Mw2nuTqCgL45HKbyspNkM1o-CAxw` (id in `app_settings.events_sheet_id`) — **read-only, never write to it**. One tab per month ("Oct", "Jan - 2026", …).
- **Who fills what:** event **details** = Student Engagement team (full admins); the **report** = that university's staff (DB-enforced by `events_guard`). "Loaded to Zoho" + "Comments" are admin-only; comments show to staff as a note.
- **Sync** (`lib/eventSync.ts`, auto every 15 min via `/api/cron/sync-events`, or Sync now): reads every tab; columns by header name (they drift between tabs — Coverage/Duration swapped, "Photos" vs "Event Photos Link"); a blank header between known neighbours is inferred (`BLANK_HEADER_RULES` — Dec lost "No of Registrations"). Month from the tab name (year from the dates if missing). Dates: real date cells exact; text resolves DD/MM vs MM/DD with the tab month; ranges ("03/11 - 9/11", "2/9 & 2/10", "4th,5th & 6th"); ranges > 31 days keep only the start.
- **Identity:** trusted Unique Key (only if unique in the whole sheet — June/July have duplicates, April/Aug have none) → `fingerprint` (sheet values + `#n` for exact duplicates) → soft match to an app-created event (university + date + title) so a later sheet copy **links**, not duplicates. Keys/fingerprints moving between rows are freed first (unique constraints).
- **Merge:** per-field three-way (`sheet_seen`): app edits kept unless the sheet changes that field; on first link a blank sheet cell never wipes app data. Rows gone from the sheet get `sheet_missing_since` (never auto-deleted; skipped if the read looks partial). Unknown campus names are **never auto-created** — map them on the hub ("Campus names in the sheet"), which moves the alias.
- **Report complete** = 7 key fields filled (`REQUIRED_REPORT_KEYS`, "NA" counts). **Overdue** = incomplete and `event_last_day` ≥ `event_nudge_after_days` (2) ago.
- **Reminders** (`lib/eventNudges.ts`, daily 10:00 IST via `/api/cron/event-nudges`, or Preview / Queue now on the hub): due after 2 days, escalated after 7, only events from the last 45 days (no backlog spam); recipients = university's active staff with `receive_reminders` in Student Engagement/all scope; one row per (event, stage, staff). Queued rows are sent by the WhatsApp sender within a minute (template `pingboard_event_report`); rows queued > 24 h ago are expired, never sent.
- **Export** (`/admin/events/export?…&format=xlsx|csv`, full + read-only admins): current filters, sheet column layout + status/source/link; pages past 1000 rows; CSV has UTF-8 BOM + formula guard. **Bulk Zoho** (full admins): row checkboxes join `form="bulk-zoho"`.

## Features / routes

- **Admin** (`/admin/*`): Overview (stats), ＋New (author task, multi-university fan-out, dynamic dropdowns), Schedule (Yesterday/Today/Upcoming + uni filter + **date picker**), Tasks, Source (mode + Sync now + last-sync status), Staff (directory with inline **Edit / Activate·Deactivate / guarded Delete**, + new/edit, Admin Access tab), Tickets (triage + tag + **date picker** on raised date), Reminders (Today/Tomorrow/Upcoming + date picker + uni filter; status + delivery receipt + skip/fail reason), **WhatsApp** (switch, test mode, quiet hours, test message, today's stats, failures, setup checklist, template text with Copy), History (university rollup + activity feed with **date picker**, 200-row cap for a day), Comms (internal messages), Announcements.
- **Admin Events** (`/admin/events`): month/university/status/Zoho filters, completion + overdue stats, per-university table, event list with bulk Zoho, Excel/CSV export, sheet sync status + Sync now, report reminders panel, data quality (campus mapping, removed rows, dates, duplicate keys); `/admin/events/new` (fan-out per university), `/admin/events/[id]` (details, report, provenance, delete).
- **University** (`/u/[code]/*`): Board (overdue-reports banner, reminder-timing control, Yesterday/Today/Upcoming), Team, My Reminders, **Events** (list by month + report form), Tickets. Announcement bar. Task detail: status update, Send-now, View-in-Sheet, **admin-only Edit/Delete** (audited).
- Date picker = shared `DateSearch` component (`?date=YYYY-MM-DD`, IST day via `dateWindow`; clears `?view=`, and `ViewTabs` clears `?date=`).
- Staff: `setStaffActive` (soft — keeps history, stops reminders) and `deleteStaff` (permanent; warns when a login is linked). Phones are normalized to E.164 by `toE164` in `lib/format.ts` (bare 10-digit → +91).
- Login (`/login`), `/blocked`, global `error.tsx` (production hides the message — so never let a server action throw for expected cases).

## Conventions

- **Timezone:** store UTC, display **Asia/Kolkata**. `lib/time.ts` (istWindow/dateWindow) + `lib/format.ts` (fmtIST, utcToIstLocalInput, toE164). India has no DST.
- **Reveal animations** animate **on mount** (not whileInView). **Don't** per-row stagger big lists.
- **Server actions** in `web/src/app/actions.ts`. User-facing errors: `useActionState` returning a state object (`{error}` or `{tone,title,detail}`) — never throw for expected failures; check every Supabase `error`; map DB unique violations to friendly text (`friendlyDbError`).
- Forms that call a server action and may fail: submit via `keepValues(action)` (in `EventForms.tsx`) — React 19 resets an `action=` form after submit even on error, which would wipe typed text.
- **Responsive:** TopNav shows the link bar only at `xl` (≥1280px), otherwise a ☰ grid menu; email/role/sign-out live in the account menu. `.filter-input` is 16px below 1024px (stops iOS zoom). Data tables get `min-w-[680px]` inside `overflow-x-auto`; forms are `grid gap-4 sm:grid-cols-2` (single column on phones); titles `text-3xl sm:text-4xl`. `body { overflow-x: clip }` (keeps the sticky header).
- Tailwind tokens: `ink, muted, line, canvas, surface, accent, accent-soft, success, warn, danger`. Fonts: `font-display`, `font-ui`.
- Logos: `public/niat-logo.png` (full, login + footer), `public/niat-shield.png` (nav mark, cropped x=0..240, transparent), `src/app/icon.png` (favicon). Tab title "PingBoard".

## Run / build / deploy

```bash
cd web && npm run dev          # localhost:3000 (uses web/.env.local → live Supabase)
cd web && npm run build        # production build (verify before pushing)
cd web && npx tsc --noEmit     # typecheck
```
- `.claude/launch.json` has the `web-dev` config for the preview tools.
- **Vercel:** root dir `web`, preset Next.js, `regions:["bom1"]` (`web/vercel.json`). Push to `main` → auto-deploy (~1–2 min).
- After OAuth/URL changes, update **Supabase → Auth → URL Configuration** or login breaks.
- **Hard-reload (Ctrl+Shift+R)** after deploys (favicons especially are cached).
- Localhost and prod share **one database** — data written locally is live immediately.

## Verifying DB behavior

Throwaway script (scratchpad, or `scripts/_*.mjs` deleted afterwards) run via PowerShell: simulate a user with `set_config('request.jwt.claims', '{"sub":"<id>","role":"authenticated"}', true)` + `set local role authenticated` in a transaction, assert, then `ROLLBACK`. Used to verify RLS, reminders, sync idempotency, audit, and the admin-grant bug. Don't mutate real task rows to test — test merge logic as pure functions instead.

---

## Current data facts (2026-09-30)

- **22 universities** — 18 seeded + JOY (Chennai), Testing University (staff: Ravi), Central Testing, and **"Chalapathyl"** (a sheet typo auto-created 2026-09-07, 2 tasks; should be merged into Chalapathy or fixed in the sheet). "Takshasila" is displayed as **Takshashila** (code unchanged).
- **806 events** (Oct 2025 – Aug 2026, 12 tabs); campus names: CIET → Chalapathy, Chevella / BITs Chevella → NIAT-Chevella, Takshashila → Takshashila. 311 overdue reports overall (mostly Oct–Dec 2025).
- **~10.3k tasks** (the Communication sync scans ~10.2k sheet rows, all mapped) + 25 UI-authored. **24 sheet-origin rows are no longer in the sheet** (edited/deleted there) and still show in the app.
- Last feature deploy: commit `9511286` (Event Reports, read-only admin, reminders, export, responsive UI) — Vercel success 2026-09-30; docs commit `1538deb` also deployed.
- Sheet data-entry typos (imported as-is): entry dates with year 6026, publish dates with year 206, ~224 blank/unparseable publish times.
- ~76 staff across 21 universities (4 from the original import skipped for blank phones).

## Current state (2026-11-24, read-only checks)

- **Source mode is `sheet`** (never switched to UI). Sheet sync healthy: 5,215 cron runs since 2026-09-28, 0 failures; first sync after 0031 (11:40 IST) succeeded.
- **No university staff have ever signed in** — accounts are 5 full admins + 1 read-only admin. Since 27 Oct all task changes came from admins (98) or the sync (221); 0 tickets. So the 0031 bug never blocked anyone, but would have on day one of a staff rollout.
- **Tasks arrive late:** of 249 tasks added in the last 14 days, median **40 min** before publish; **42%** arrived < 15 min before (12% after publish time had passed). Measured from when the sync picked them up (sheet entry may be up to 10 min earlier). Of 284 tasks published in the last 14 days: 51% got reminders in time, 30% arrived too late for at least one reminder, 14% were already published on arrival, 5% (KKH) had no staff.
- Consequence: at any moment there are usually **0 future tasks / 0 upcoming reminders** — a WhatsApp test-mode trial needs a real upcoming task at a university where a test number is assigned.
- **KKH has no staff assigned** (15 tasks in 14 days got no reminders). 19 of 22 active universities have staff; 18 have reminder-ready staff.

## Outstanding / TODO

1. **WhatsApp go-live** (code deployed 2026-11-24, 0031 applied) — user: Meta setup per `docs/WHATSAPP_SETUP.md` (business verification, number, System User token, payment, 2 templates, Vercel keys, webhook). Then: test message from Admin → WhatsApp → apply **0032** → test mode with 2–3 numbers → live. Ideas not built: combine several posts due at the same minute into one message; per-staff opt-out.
2. **Late-arriving tasks** (42% < 15 min before publish) — options to discuss: ask comms to enter rows earlier; sheet sync `*/5` (possible now on Pro, needs a migration); an immediate reminder when a task arrives inside the reminder window.
3. **Assign staff to KKH** (in-app Staff page) — user's call.
4. **Rotate** the exposed service_role key + DB password (update root `.env`, `web/.env.local`, Vercel).
5. **Data clean-up (needs the user's call):** merge/fix "Chalapathyl"; review the 24 orphan sheet rows; ask comms to rename Communication column F back to "University"; events sheet — 6 duplicate Unique Keys, 3 unreadable dates ("20226").
6. Add WhatsApp numbers for the 4 skipped staff (via the in-app Staff page).
7. **Feature backlog suggested to the user (not started):** university scorecards (on-time publish %, overdue, report completion, trends) · daily admin digest (WhatsApp/email) · calendar view of schedule + events · event photo uploads (Supabase Storage) · data clean-up screen (orphans, removed rows, typo universities) · global search (Ctrl+K) · installable PWA.
8. Nice-to-haves: optional **write-back** of BOA status to the sheet (needs a Google service account with edit access); Edit/Delete from Schedule rows; realtime board updates; two-way content sync; pagination for "All time".
