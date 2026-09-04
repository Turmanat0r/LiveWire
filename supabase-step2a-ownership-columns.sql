-- ============================================================================
-- LiveWire - step 2a: ownership columns
--
-- SAFE. Paste this whole file and press Run. It changes no behaviour at all.
--
-- It adds an `owner` column to anglers, catches and donations. No policy reads
-- that column yet, so every read, write and delete keeps working exactly as it
-- does today. All it does is start recording who wrote each new row, so that
-- step 2b has something to enforce against later.
--
-- Rows that already exist get owner NULL, as do rows written by a device still
-- using the shared anon key.
--
-- The column default is what lets the app's upserts stamp ownership with no
-- client change: the write body only ever carries id and data, so `owner`
-- fills itself in.
--
-- The enforcement half of this migration lives in a SEPARATE file,
-- supabase-step2b-enforce-policies.sql, because it can take the app down if it
-- is run at the wrong moment. Nothing in THIS file can.
-- ============================================================================

alter table public.anglers   add column if not exists owner uuid default auth.uid();
alter table public.catches   add column if not exists owner uuid default auth.uid();
alter table public.donations add column if not exists owner uuid default auth.uid();
alter table public.messages  add column if not exists owner uuid default auth.uid();

create index if not exists anglers_owner_idx   on public.anglers   (owner);
create index if not exists catches_owner_idx   on public.catches   (owner);
create index if not exists donations_owner_idx on public.donations (owner);
create index if not exists messages_owner_idx  on public.messages  (owner);


-- ---------------------------------------------------------------------------
-- Watch it working: open the app on a phone and register, then run this. Once
-- anonymous sign-in is enabled the new row carries an owner; before that, and
-- for every existing row, it is NULL.
-- ---------------------------------------------------------------------------
select id, owner, data ->> 'name' as name, created_at
from public.anglers
order by created_at desc
limit 5;
