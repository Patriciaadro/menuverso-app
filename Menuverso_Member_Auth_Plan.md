# Menuverso — Member accounts + double opt-in: implementation plan

**Goal:** Real member accounts that (1) are stored server-side so you can see every user and they work on any device, and (2) require **double opt-in** — on sign-up the account is created *inactive*, an activation email is sent, and the account only works after the person clicks the link.

**Today's state:** member sign-ups are saved only in the visitor's own browser (localStorage). They never reach a server, you can't see them, and there's no email confirmation. The waitlist + partner leads already store correctly in Supabase; this plan is only about **member accounts**.

---

## Recommended approach: Supabase Auth (not custom code)

Supabase has a built-in authentication system. Turning on its "Confirm email" setting gives us **double opt-in for free**: `signUp` creates the user as unconfirmed, automatically sends an activation email, and the user **cannot log in until they click the link**. It also gives us password reset, secure sessions, and a dashboard list of every member — all without us writing (and you trusting) custom password/security code.

We already loaded the Supabase client library on the site (for the live redemption feed), so the front end is ready to use it.

> Alternative considered: a custom `members` table + serverless login/confirm endpoints (extends the waitlist pattern we started). Rejected as the default because it means hand-rolling password hashing, sessions, and reset — more code, more security surface, more to maintain — for no benefit over Auth. (We'd retire the half-built `/api/member-confirm` + `member_confirmations` either way; Auth supersedes them.)

---

## Phase 0 — Supabase dashboard config (Patricia/Amir, ~30–45 min, no code)

1. **Authentication → Providers → Email:** enable, and turn **ON "Confirm email"** (this is what enforces double opt-in — no login until confirmed).
2. **Authentication → URL Configuration:** set **Site URL** = `https://menuverso.com` and add **Redirect URLs** (e.g. `https://menuverso.com/confirmar`, `https://menuverso.com/app`) so the activation link returns into the app.
3. **Email delivery — use Resend as SMTP** (so activation emails come from `info@menuverso.com` on your verified domain, not Supabase's rate-limited default, which caps ~3–4 emails/hour and isn't launch-grade):
   - Supabase → Project Settings → Authentication → **SMTP Settings** → enter Resend's SMTP host/port/user/pass (Resend dashboard → SMTP).
   - Sender: `info@menuverso.com` (domain already being verified in Resend for the waitlist).
4. **Customize the "Confirm signup" email template** (Auth → Email Templates): subject + body in the Xibeca tone, ES primary / EN fallback, with the activation button.

## ✅ BUILT (shipped dormant behind a flag)

Phases 1–2 are now implemented in `index.html`, gated by **`const MV_USE_SUPABASE_AUTH = false;`**
(near the Supabase constants). While `false`, members use the local demo exactly as before
(verified: all test suites green). After you finish Phase 0, **flip it to `true`** and redeploy —
sign-up/login/activation/reset switch to Supabase Auth. Demo accounts (maria@/admin@/owner@)
always use the local path. Migration `supabase/migrations/...profiles.sql` adds the profiles
table + RLS + auto-create trigger. Verified with a mocked Auth client (signup→activation, login
mirror, unconfirmed-login block, demo bypass — 7/7).

**Go-live switch:** Phase 0 dashboard config → run the `profiles` migration → set
`MV_USE_SUPABASE_AUTH = true` → push/deploy → test a real sign-up + activation click.

## Phase 1 — Front-end auth swap (engineer / me) — DONE

Reuse the already-loaded `supabase-js` client.

1. **Sign-up:** `supabase.auth.signUp({ email, password, options:{ data:{ first_name, last_name }, emailRedirectTo } })` → Supabase creates the unconfirmed user + sends the activation email. Replace the "logged in immediately" behavior with a **"Check your email to activate your account"** screen.
2. **Activation:** the email link returns to `/confirmar` (or `/app`); supabase-js completes the session and we show **"Account activated → continue"**. (Re-skins the existing `/confirmar` page for this.)
3. **Login:** `supabase.auth.signInWithPassword()`. If the email isn't confirmed yet, show a clear **"Confirm your email first — resend link?"** message (with a resend button).
4. **Sessions:** replace the localStorage `state.session` / `setSession` with Supabase Auth (`getSession()` + `onAuthStateChange`). `currentUser()` reads the Auth user. All the existing route guards keep working — they just read the new source.
5. **Password reset:** wire the existing "Forgot password?" link to `supabase.auth.resetPasswordForEmail()` + a reset screen.

## Phase 2 — Member profile data

- Add a **`profiles`** table keyed by the Auth user id (first/last name, prefs), **RLS: each user can read/write only their own row**.
- Decide scope for now (see decision #3): the minimum for double opt-in is **auth + identity**. Saved venues / subscription / redemption history can stay local for a first cut and move to per-user rows in a fast follow, or move now.
- Re-create the demo accounts (maria@, admin@, partner@) as real Auth users, or keep a demo bypass for showcasing.

## Phase 3 — Test & go-live

- Sign-up → email arrives → click link → activated → login works.
- Login **before** activation is blocked with a helpful message; resend works.
- Password reset end-to-end; login from a second device works.
- RLS verified on `profiles`.
- Retire the localStorage member store + the interim `/api/member-confirm` + `member_confirmations` table (superseded by Auth).

---

## What I need from you to start (3 decisions)

1. **Confirm the approach:** Supabase Auth (recommended) vs custom serverless auth.
2. **Email delivery:** OK to use **Resend SMTP** in Supabase (best), or start on Supabase's built-in email to test, then switch?
3. **Data scope now:** auth + identity only (fastest to ship double opt-in), or also move saved/subscription/history server-side in the same pass?

## Rough sequencing
- Phase 0 (you, dashboard): ~½ hour.
- Phase 1 (auth swap + screens): the bulk of the work — sign-up/login/activation/session/reset.
- Phase 2 (profiles + RLS): small.
- Phase 3 (test/go-live): a focused pass.

I can build Phases 1–3 once Phase 0 is done (or in parallel against a test project). The activation/login flows can't be fully verified from my side without the live Auth project — final confirmation is a real sign-up + click-through on the deployed site.
