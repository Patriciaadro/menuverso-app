-- Menuverso · venue write lockdown (QA item 7, interim until real auth)
--
-- RUN ORDER (do not run this first):
--   1. Deploy the code with /api/venue-upsert, /api/venues-all, /api/venue-key.
--   2. Set ADMIN_WRITE_SECRET in Vercel (Production + Preview; a long random
--      string, e.g. `openssl rand -base64 32`), redeploy, and unlock the admin
--      device in the admin dashboard with it.
--   3. Run THIS file in Supabase -> SQL Editor.
--   4. In the admin, "Enlace de edición" for each existing partner venue and
--      send each owner their link (venues created before today have no key).
--
-- What it does:
--   - Creates public.venue_edit_keys (sha256 of each partner's edit key;
--     service role only).
--   - Drops EVERY existing policy on public.venues (they were created in the
--     dashboard and include anon INSERT/UPDATE/DELETE), then allows anon and
--     authenticated to SELECT only LIVE venues and seed_ override rows.
--   - Revokes write privileges from anon/authenticated as a second lock.
-- The /api functions use the service role, which bypasses RLS.
-- Idempotent: safe to re-run.

-- ------------------------------------------------------------ edit keys
create table if not exists public.venue_edit_keys (
  venue_id   text        primary key,
  key_hash   text        not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
alter table public.venue_edit_keys enable row level security;
comment on table public.venue_edit_keys is
  'sha256 of the per-venue partner edit key (QA item 7). Service role only; no policies.';

-- ------------------------------------------------------------ venues: read-only for the public key
alter table public.venues enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'venues' loop
    execute format('drop policy %I on public.venues', p.policyname);
  end loop;
end $$;

create policy venues_public_read_live on public.venues
  for select to anon, authenticated
  using (data->>'status' = 'LIVE' or id like 'seed\_%');

revoke insert, update, delete on public.venues from anon, authenticated;

-- ------------------------------------------------------------ sanity check
-- Expect: venues rls=true with exactly one policy (SELECT); venue_edit_keys rls=true, 0 policies.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select string_agg(p.policyname || ':' || p.cmd, ', ') from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('venues', 'venue_edit_keys')
order by 1;
