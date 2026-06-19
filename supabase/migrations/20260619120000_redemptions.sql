-- Menuverso · cross-device redemption sync (member confirm → partner live feed)
--
-- Creates public.redemptions. The member's slide-to-confirm writes a row here
-- (via the /api/redeem serverless function, service role), and the partner's
-- "Canjes en vivo" feed reads today's rows (via /api/redemptions, service role).
--
-- SECURITY MODEL: RLS is ENABLED with NO policies, so the anon/publishable key
-- can neither read nor write this table. ONLY the service_role key (used inside
-- the serverless functions, server-side) can touch it. This keeps redemptions
-- from being spoofed or scraped with the public client key.
--
-- How to apply: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.

create table if not exists public.redemptions (
  id           uuid primary key default gen_random_uuid(),
  venue_slug   text        not null,
  member_id    text,
  member_name  text,
  deal_title   text,
  redeemed_at  timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at   timestamptz not null default now()
);

-- Fast lookup for the partner feed: "today's redemptions for this venue".
create index if not exists redemptions_venue_time_idx
  on public.redemptions (venue_slug, redeemed_at desc);

comment on table public.redemptions is
  'Member redemptions (slide-to-confirm). Written + read only by the service role via /api/redeem and /api/redemptions. RLS on, no anon policies.';

-- Lock it down: RLS on, and we intentionally add NO policies → anon/publishable
-- key has zero access; the serverless functions use the service_role key which
-- bypasses RLS.
alter table public.redemptions enable row level security;

-- Realtime (optional upgrade): to push instead of poll, add this table to the
-- supabase_realtime publication and subscribe in the partner feed:
--   alter publication supabase_realtime add table public.redemptions;
