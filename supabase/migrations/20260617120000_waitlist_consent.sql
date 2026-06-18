-- Menuverso · waiting-list GDPR/RGPD consent fields
-- Adds consent + double-opt-in columns to the waiting-list table.
--
-- Table: public.launch_waitlist (renamed from the old "Launch-waitlist" by the rename migration).
-- If your table is actually named differently, change it below before running.
--
-- How to apply (pick one):
--   • Supabase Dashboard → SQL Editor → paste this file → Run
--   • or, with the Supabase CLI linked to the project:  supabase db push
--
-- Idempotent: safe to run more than once (ADD COLUMN IF NOT EXISTS).

alter table public.launch_waitlist
  add column if not exists consented_at            timestamptz,
  add column if not exists consent_version         text,
  add column if not exists ip_address              text,
  add column if not exists double_opt_in_confirmed boolean not null default false,
  add column if not exists confirmed_at            timestamptz;

comment on column public.launch_waitlist.consented_at            is 'When the signup ticked the consent box (Art. 6.1.a GDPR / RGPD).';
comment on column public.launch_waitlist.consent_version         is 'Privacy-policy version consented to, e.g. "v1-june-2026". Bump when the policy materially changes.';
comment on column public.launch_waitlist.ip_address              is 'Request IP captured server-side at submission time (consent audit trail).';
comment on column public.launch_waitlist.double_opt_in_confirmed is 'TRUE only after the email confirmation link is clicked. Do NOT send marketing email until this is true.';
comment on column public.launch_waitlist.confirmed_at            is 'Timestamp when double opt-in was confirmed.';

-- Note: a per-signup confirmation-token store is added in a later migration
-- (double opt-in / step 4), kept separate so this consent migration can ship now.
