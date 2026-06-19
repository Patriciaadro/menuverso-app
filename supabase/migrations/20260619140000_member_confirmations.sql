-- Menuverso · member sign-up email confirmation (double opt-in for member accounts).
--
-- Stores a one-time, hashed confirmation token per member sign-up. The token's
-- raw value is emailed to the member; clicking the link verifies it server-side.
-- Mirrors waitlist_confirmations.
--
-- SECURITY: RLS ON, no policies → only the service_role key (inside the
-- serverless functions) can read/write. Anon/publishable key has no access.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.

create table if not exists public.member_confirmations (
  token_hash  text        primary key,
  email       text        not null,
  name        text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists member_confirmations_email_idx
  on public.member_confirmations (email);

comment on table public.member_confirmations is
  'One-time hashed tokens for member sign-up email confirmation (double opt-in). Service-role only.';

alter table public.member_confirmations enable row level security;
