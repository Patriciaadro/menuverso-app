-- Menuverso · double opt-in confirmation tokens (GDPR/RGPD step 4)
-- One short-lived token per signup. We store only a SHA-256 HASH of the token,
-- never the raw token (the raw value lives only in the email link).
--
-- Apply after the consent migration. Supabase SQL Editor → Run, or: supabase db push

create table if not exists public.waitlist_confirmations (
  token_hash  text        primary key,                 -- sha256(raw token)
  email       text        not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,                    -- created_at + 48h
  used_at     timestamptz                              -- set when the link is clicked
);

create index if not exists waitlist_confirmations_email_idx on public.waitlist_confirmations (email);

-- Only the server (service_role key) ever touches this table. Enable RLS with
-- NO policies so anon/auth clients can neither read nor write it; service_role
-- bypasses RLS. This keeps tokens out of reach of the public anon key.
alter table public.waitlist_confirmations enable row level security;

comment on table public.waitlist_confirmations is 'Double opt-in tokens for the waiting list. Stores a hash of each token; server-only access.';
