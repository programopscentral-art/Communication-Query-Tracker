# Auth & Backend Setup — Google SSO locked to @nxtwave.co.in

This is the one-time setup **you** perform in the Google Cloud and Supabase
consoles (I can't log into your accounts or create credentials). ~10 minutes.
After this, the "Welcome back → Continue with Google" login works, and only
`@nxtwave.co.in` accounts can get in.

> **Enforcement is layered** (so it can't be bypassed):
> 1. **Google consent screen = Internal** → only your Workspace org can even authorize.
> 2. **App callback + proxy** → session rejected if email domain ≠ nxtwave.co.in.
> 3. **DB trigger** (`0002_auth.sql`) → a non-domain user can never be created.

---

## Part A — Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
   - Region: **South Asia (Mumbai) `ap-south-1`** (lowest latency for India).
   - Save the database password.
2. **Project Settings → API**, copy into `web/.env.local` (from `.env.local.example`):
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → keep for the root `.env` (server-only; sync + edge functions)
3. Apply the database migrations (creates all tables + the domain-lock trigger):
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   (Or paste the files in `supabase/migrations/` into the SQL Editor in order.)

## Part B — Google OAuth client

1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen**:
   - **User type = Internal** ← this alone restricts sign-in to your
     `nxtwave.co.in` Workspace. (Only pick External if you can't use Internal;
     the DB trigger still blocks outsiders either way.)
   - App name: `Communication Query Tracker`. Save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URI** — add exactly:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
   - Create, then copy the **Client ID** and **Client secret**.

## Part C — Connect Google to Supabase

1. Supabase → **Authentication → Sign In / Providers → Google** → enable.
   - Paste the **Client ID** and **Client secret** from Part B. Save.
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (dev) — change to your prod URL later.
   - **Redirect URLs** — add:
     ```
     http://localhost:3000/**
     https://tracker.yourdomain.in/**
     ```
3. (Recommended) **Authentication → Providers** — leave only Google enabled.

## Part D — Make yourself an admin

By default every new sign-in is provisioned as a `boa`. To be an admin, add your
email to the allowlist (SQL Editor), then sign in:
```sql
insert into admin_emails (email) values ('nalamasa.sanjay@nxtwave.co.in')
on conflict do nothing;
```

## Part E — Run the app

```bash
cd web
cp .env.local.example .env.local   # fill in the two values from Part A
npm run dev
```
Open http://localhost:3000 → you're redirected to `/login` → **Continue with
Google** → sign in with an `@nxtwave.co.in` account. A non-domain account lands
on `/blocked`.

---

## How the pieces map to code

| Layer | File |
|---|---|
| Login page ("Welcome back") | `web/src/app/login/page.tsx` + `GoogleButton.tsx` |
| OAuth callback + domain check | `web/src/app/auth/callback/route.ts` |
| Session refresh + domain lock (every request) | `web/src/proxy.ts` + `web/src/lib/supabase/middleware.ts` |
| Blocked screen | `web/src/app/blocked/page.tsx` |
| Hard DB enforcement + role provisioning | `supabase/migrations/0002_auth.sql` |
| Allowed domain constant | `web/src/lib/constants.ts` (`ALLOWED_DOMAIN`) |

## Troubleshooting

- **`redirect_uri_mismatch`** → the URI in Part B must be the **Supabase** callback (`…supabase.co/auth/v1/callback`), not the app URL.
- **Signs in then bounces to `/blocked`** → the account isn't `@nxtwave.co.in`, or `allowed_domain` in `app_settings` differs.
- **Role shows `pending`** → the `app_users` row wasn't created; check the migration ran and the trigger exists.
