# Menuverso — Go-live checklist

The code is finished and committed. Everything below is **dashboard/config work** (Supabase,
Vercel, Resend, GoDaddy). Tick top-to-bottom. Two finish lines are marked:
**🟢 PRE-LAUNCH** (marketing site + collect waitlist/leads) and **🚀 FULL APP** (member accounts,
emails, live redemptions).

Related docs in this folder: `Menuverso_Resend_DNS_Handoff.md`, `Menuverso_Member_Auth_Plan.md`,
`Menuverso_Auth_Emails.md`.

---

## 0. Confirm signups actually land  ⚠ do this first
The website writes waitlist + restaurant leads with the public key; they only store if the
tables allow the anonymous insert.
- [ ] Run migration **`20260619170000_rls_public_inserts.sql`** (Supabase → SQL Editor). It turns on
      RLS + an insert-only policy for `launch_waitlist` and `partner_leads`.
- [ ] Test: submit one waitlist signup + one restaurant form on the site, then check
      **Supabase → Table Editor → `launch_waitlist`** and **`partner_leads`** — the rows should appear.

## 1. Deploy the code
- [ ] `git push origin main` (already committed locally).
- [ ] Confirm the **production** Vercel project builds green. Find which one serves the domain:
      **Vercel → project → Settings → Domains** (the one with `menuverso.com` attached).
- [ ] The duplicate `…-99ge` project is likely a leftover — if it has no production domain, delete it
      (and don't put secrets there).

### 🟢 PRE-LAUNCH ready after 0 + 1
The marketing site is live and collecting waitlist emails + restaurant leads into Supabase.
Everything below is for the full app launch.

---

## 2. Run the remaining Supabase migrations
Supabase → SQL Editor, **in filename order**, all safe to re-run:
- [ ] `20260617110000_rename_waitlist_table.sql`  *(if not already run)*
- [ ] `20260617120000_waitlist_consent.sql`
- [ ] `20260617130000_waitlist_confirmation_tokens.sql`
- [ ] `20260619120000_redemptions.sql`  *(live partner redemption feed)*
- [ ] `20260619140000_member_confirmations.sql`  *(only if NOT using Supabase Auth; superseded by §4)*
- [ ] `20260619160000_profiles.sql`  *(member accounts)*

## 3. Email infrastructure (Resend + DNS) — nothing email works without this
Follow `Menuverso_Resend_DNS_Handoff.md`. In short:
- [ ] Resend → add + **verify** domain `menuverso.com` (EU region).
- [ ] Add the DKIM/SPF/(DMARC) records Resend gives you in **GoDaddy → DNS** (merge SPF, don't duplicate).
- [ ] Resend → create an **API key**.
- [ ] Vercel (production project) → Settings → Environment Variables → add for Production + Preview:
      `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` → redeploy.

## 4. Turn on member accounts + double opt-in
Plan: `Menuverso_Member_Auth_Plan.md`. Templates: `Menuverso_Auth_Emails.md`.
- [ ] Supabase → Authentication → Providers → **Email**: enable, turn **ON "Confirm email"**.
- [ ] Supabase → Authentication → URL Configuration: **Site URL** `https://menuverso.com`;
      add Redirect URLs (`https://menuverso.com/confirmar`, `https://menuverso.com/app`).
- [ ] Supabase → Project Settings → Auth → **SMTP**: enter Resend SMTP creds, sender `info@menuverso.com`.
- [ ] Supabase → Auth → Email Templates: paste templates #1 (Confirm signup) + #2 (Reset password)
      from `Menuverso_Auth_Emails.md` (#3/#4 optional).
- [ ] In `index.html`, set **`MV_USE_SUPABASE_AUTH = true`** → push → redeploy.
- [ ] Test: sign up → activation email arrives → click link → account active → log in. Confirm a new
      row appears in **Supabase → Authentication → Users** and **`profiles`**.

### 🚀 FULL APP ready after 0–4

---

## 5. Optional / when you want it
- [ ] **Waitlist confirmation email:** flip the waitlist form to POST `/api/waitlist` (one-line dev change)
      so waitlist signups also get a double-opt-in email. (Today they store fine but get no email.)
- [ ] **Partner lead auto-reply:** wire the partner form to send email #5 (partner acknowledgement) via
      a small Resend function on submit (currently the lead just stores).
- [ ] **Realtime redemptions:** already on by default once §2 (redemptions migration) + §3 env are done.
- [ ] Delete the leftover Vercel `-99ge` project; remove the demo `?demo=1` box for production if desired.

---

## Quick reference — what powers what
| Feature | Needs |
|---|---|
| Waitlist + restaurant leads storing | §0 + §1 |
| Live redemption feed (partner sees member redeem) | §2 (redemptions) + §3 env |
| Member sign-up + activation email + login | §2 (profiles) + §3 + §4 |
| Password reset email | §3 + §4 |
| Any email at all | §3 (Resend + DNS) |
