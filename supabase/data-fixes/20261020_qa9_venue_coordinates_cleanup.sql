-- Menuverso · QA item 9 data cleanup (20 Oct 2026)
-- Run in Supabase → SQL Editor. Step 1 is read-only; run it first and check
-- the rows before running step 2.
--
-- Nothing is deleted. Stale rows are tombstoned with status DELETED_BY_ADMIN,
-- the same marker the admin "Delete" button writes; the app skips those rows
-- and removes them from every device on its next venue pull.

-- ── Step 1 · preview (read-only) ─────────────────────────────────────────────
select id,
       data->>'name'    as name,
       data->>'status'  as status,
       data->>'address' as address,
       data->>'lat'     as lat,
       data->>'lng'     as lng,
       updated_at
from public.venues
where id in ('pv_tk5lhiqk', 'pv_3t4bli5d', 'pv_urwp8joi')
   or (data->>'status' = 'LIVE' and (coalesce(data->>'lat', '') = '' or coalesce(data->>'lng', '') = ''))
order by id;

-- ── Step 2 · fix ─────────────────────────────────────────────────────────────
-- a) Tombstone the two stale REJECTED "Nuevo local" drafts.
-- b) Send every LIVE venue without coordinates back to PENDING_APPROVAL
--    (QA found pv_urwp8joi "New mexican"). Re-approving it in the admin now
--    geocodes the address, and refuses if it can't be located.
-- Works whether venues.data is json or jsonb.
do $$
declare t text;
begin
  select data_type into t
  from information_schema.columns
  where table_schema = 'public' and table_name = 'venues' and column_name = 'data';

  execute format($f$
    update public.venues
       set data = (data::jsonb || jsonb_build_object('status', 'DELETED_BY_ADMIN', 'deleted_at', now()))::%s,
           updated_at = now()
     where id in ('pv_tk5lhiqk', 'pv_3t4bli5d')
       and data->>'status' = 'REJECTED'
  $f$, t);

  execute format($f$
    update public.venues
       set data = (data::jsonb || jsonb_build_object('status', 'PENDING_APPROVAL'))::%s,
           updated_at = now()
     where data->>'status' = 'LIVE'
       and (coalesce(data->>'lat', '') = '' or coalesce(data->>'lng', '') = '')
  $f$, t);
end $$;

-- ── Step 3 · verify: expect zero rows ────────────────────────────────────────
select id, data->>'name' as name
from public.venues
where data->>'status' = 'LIVE'
  and (coalesce(data->>'lat', '') = '' or coalesce(data->>'lng', '') = '');
