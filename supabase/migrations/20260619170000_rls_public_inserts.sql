-- Menuverso · lock down the two public-write tables so signups LAND but stay private.
--
-- The website writes waitlist signups and restaurant leads using the PUBLISHABLE
-- (anon) key from the browser. With Row-Level Security on, those inserts only
-- succeed if there's an INSERT policy for the anon role. This migration:
--   • turns RLS ON for both tables, and
--   • allows anon to INSERT only — no SELECT/UPDATE/DELETE.
-- So the public can submit the forms, but nobody can read or scrape the data
-- with the public key. Reads/edits happen server-side via the service_role key
-- (the /api functions + the Supabase dashboard), which bypasses RLS.
--
-- Apply: Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run.
-- (If a table doesn't exist yet, create it first / comment that block out.)

-- ---- launch_waitlist (email waitlist signups) ----
alter table public.launch_waitlist enable row level security;
do $$ begin
  create policy "anon_insert_waitlist"
    on public.launch_waitlist for insert to anon with check (true);
exception when duplicate_object then null; end $$;

-- ---- partner_leads (restaurant "list your restaurant" form) ----
alter table public.partner_leads enable row level security;
do $$ begin
  create policy "anon_insert_partner_leads"
    on public.partner_leads for insert to anon with check (true);
exception when duplicate_object then null; end $$;

-- NOTE: no SELECT policy for anon on purpose. To VIEW the rows, use the Supabase
-- dashboard Table Editor (service role) or query with the service_role key.
-- Quick check after running:  select count(*) from public.launch_waitlist;
