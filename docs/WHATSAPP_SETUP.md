# WhatsApp go-live — step by step

PingBoard sends two WhatsApp **template** messages through the **Meta WhatsApp Cloud API**:

| Template | When | To |
|---|---|---|
| `pingboard_publish_reminder` | 15 & 10 min before each post's publish time | that university's staff with reminders on |
| `pingboard_event_report` | after the 10:00 IST check, for overdue event reports | that university's Student Engagement / all-team staff |

The code is done. What's left is the Meta account (only you can do it), keys in Vercel,
and a careful rollout. Every exact text you need to paste is also shown on
**Admin → WhatsApp** in the app, with Copy buttons.

---

## Step 0 — Ask first (saves days)

Ask NxtWave's marketing / IT team: **"Do we already have a WhatsApp Business API account
(Meta directly, or via Gupshup / Interakt / AiSensy / Wati)?"**
- **Meta directly** → ask them to add you to that business portfolio and use a *new* phone
  number for PingBoard (Steps 3–9 still apply, Steps 1–2 are done).
- **Via a BSP** → tell Claude; the sender needs a small adapter for that BSP's API.
- **None** → continue with Step 1.

## Step 1 — Business portfolio
1. Open **business.facebook.com** → create or pick the **NxtWave** business portfolio.
2. **Settings → Security Centre → Start verification** (GST / company registration).
   Verification can take 1–5 working days. You can build and test before it finishes;
   unverified accounts can message up to 250 people a day — enough for ~73 staff.

## Step 2 — Create the app
1. **developers.facebook.com → My Apps → Create app** → use case **Other** → type **Business**
   → name `PingBoard` → choose the NxtWave business portfolio.
2. On the app dashboard: **Add product → WhatsApp → Set up**.

## Step 3 — The sending phone number
1. App → **WhatsApp → API Setup → Add phone number**.
2. Display name **NIAT PingBoard** (must relate to the business), category **Education**.
3. Use a number that is **not** on the normal WhatsApp / WhatsApp Business app (a new SIM
   or a landline that can receive an SMS or call for the code). Verify it with the code.
4. Copy the **Phone number ID** (not the phone number) → this is `META_WABA_PHONE_NUMBER_ID`.

## Step 4 — Permanent access token
1. **business.facebook.com → Settings → Users → System users → Add** → name
   `pingboard-sender`, role **Admin**.
2. **Assign assets**: *Apps* → PingBoard → Full control; *WhatsApp accounts* → your
   account → Full control.
3. **Generate new token** → app **PingBoard** → expiry **Never** → permissions
   `whatsapp_business_messaging` and `whatsapp_business_management` → copy it
   (shown only once) → this is `META_WABA_TOKEN`.
   ⚠️ Paste it only into Vercel — never into chat, email, or the repo.

## Step 5 — Payment method
**WhatsApp Manager** (business.facebook.com/wa/manage) → **Overview → Add payment method**
(credit card). Utility messages in India cost roughly ₹0.12 each (check Meta's current rate
card) — at today's volume about ₹1,000–2,000 a month.

## Step 6 — Create the two templates
**WhatsApp Manager → Message templates → Create template**, for each:
- Category **Utility** · Name exactly `pingboard_publish_reminder` / `pingboard_event_report`
  · Language **English** (code `en`; if you pick *English (US)* set `META_TEMPLATE_LANG=en_US`).
- **Body**: paste from Admin → WhatsApp (Copy button), then fill the sample values shown there.
- **Buttons → Visit website** → text **Open task** / **Fill report** → URL type **Dynamic** →
  `https://communication-query-tracker.vercel.app/{{1}}` → sample
  `https://communication-query-tracker.vercel.app/admin/schedule` (or `/admin/events`).
- Submit. Approval is usually minutes to a day. If you create them **without** the button,
  set `META_TEMPLATE_URL_BUTTON=off` in Vercel.

## Step 7 — Webhook secrets (for delivered / read ticks)
1. App → **App settings → Basic → App secret → Show** → copy → `META_APP_SECRET`.
2. Make up a long random string → `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
3. Same page: add a **Privacy policy URL** (NxtWave's) — needed to switch the app to **Live**.

## Step 8 — Vercel keys
**Vercel → communication-query-tracker → Settings → Environment Variables → Production**,
add (all **server-only — never** prefix them with `NEXT_PUBLIC_`):

| Key | Value |
|---|---|
| `WHATSAPP_PROVIDER` | `meta` |
| `META_WABA_PHONE_NUMBER_ID` | from Step 3 |
| `META_WABA_TOKEN` | from Step 4 |
| `META_APP_SECRET` | from Step 7 |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | from Step 7 |
| `META_TEMPLATE_LANG` | only if not `en` |

Then **Deployments → ⋯ → Redeploy** (env changes need a redeploy).

## Step 9 — Connect the webhook
App → **WhatsApp → Configuration → Webhook → Edit**:
- Callback URL `https://communication-query-tracker.vercel.app/api/whatsapp/webhook`
- Verify token = your `WHATSAPP_WEBHOOK_VERIFY_TOKEN` → **Verify and save**
- **Webhook fields → messages → Subscribe**.
Then flip the app from **Development** to **Live** (toggle at the top of the app dashboard).

## Step 10 — Test, then go live (in the app)
1. **Admin → WhatsApp**: the checklist should show ✓ for provider, phone ID, token, webhook.
2. **Send a test message** to your own number — once per template. Check it arrives and the
   button opens PingBoard. A minute later the delivery receipt shows on the page.
3. Tell Claude → the every-minute scheduler is switched on (migration 0032).
4. **Settings**: tick *Send WhatsApp messages*, keep **Test mode** on, add 2–3 staff numbers
   that agreed to test → Save. Watch a day of real reminders (Reminders page shows each one).
5. Tell all staff the number and to save it (so it isn't blocked or marked spam).
6. **Untick Test mode → Save** = live for every staff member.

**Emergency stop:** untick *Send WhatsApp messages* (takes effect within a minute).

## Safety built in
- Never sends more than 5 min late (configurable) — old/backlog reminders are skipped.
- Quiet hours 22:00–08:00 IST (configurable) — reminders in that window are skipped.
- Skips tasks already published, reports already completed, inactive staff.
- Retries temporary Meta errors; stops and shows the reason for setup errors (bad token,
  template missing) instead of failing every message silently.
- One reminder per (task, staff, offset) and per (event, stage, staff) — duplicates are impossible.
