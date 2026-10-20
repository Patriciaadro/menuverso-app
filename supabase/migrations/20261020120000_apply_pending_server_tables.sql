-- Menuverso · apply the server-only tables that were written but never run
-- (QA pass 20 Oct 2026, items 3 + 4).
--
-- Live check on 20 Oct 2026 (REST with the publishable key) returned PGRST205
-- "Could not find the table" for ALL of these, even though their migrations
-- have been in the repo since June:
--   public.redemptions            (/api/redeem, /api/redemptions, member sync)
--   public.member_confirmations   (/api/member-confirm, /api/confirm)
--   public.waitlist_confirmations (/api/waitlist, /api/confirm)
-- Without them every /api function fails even once the Vercel env vars exist.
--
-- SECURITY MODEL (all three): RLS ENABLED with NO policies. The publishable
-- (anon) key can neither read nor write. Only the service_role key, used
-- server-side inside the /api functions, can touch them.
--
-- Idempotent: safe to re-run. Apply: Supabase Dashboard → SQL Editor → paste → Run.

-- ---------------------------------------------------------------- redemptions
create table if not exists public.redemptions (
  id              uuid        primary key default gen_random_uuid(),
  venue_slug      text        not null,
  member_id       text,
  member_name     text,
  deal_title      text,
  redeemed_at     timestamptz not null default now(),
  -- read by /api/redemptions (partner feed); the QA brief's minimal schema
  -- omitted it, which would make that select fail with 400 → 502.
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);
-- Partner feed: "today's redemptions for this venue".
create index if not exists redemptions_venue_time_idx
  on public.redemptions (venue_slug, redeemed_at desc);
-- Member history across devices (/api/member-redemptions, item 5).
create index if not exists redemptions_member_time_idx
  on public.redemptions (member_id, redeemed_at desc);
alter table public.redemptions enable row level security;
comment on table public.redemptions is
  'Member redemptions (slide-to-confirm). Service role only via /api. RLS on, no anon policies.';

-- ------------------------------------------------------- member_confirmations
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
alter table public.member_confirmations enable row level security;
comment on table public.member_confirmations is
  'One-time hashed tokens for member sign-up email confirmation. Service role only.';

-- ----------------------------------------------------- waitlist_confirmations
create table if not exists public.waitlist_confirmations (
  token_hash  text        primary key,
  email       text        not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index if not exists waitlist_confirmations_email_idx
  on public.waitlist_confirmations (email);
alter table public.waitlist_confirmations enable row level security;
comment on table public.waitlist_confirmations is
  'Double opt-in tokens for the waiting list (sha256 of token). Service role only.';

-- ------------------------------------------------------------ sanity check
-- Expect three rows, rls_enabled = true, policies = 0 for each.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('redemptions', 'member_confirmations', 'waitlist_confirmations')
order by 1;
