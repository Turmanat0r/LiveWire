-- ============================================================================
-- LiveWire - restore open access
--
-- RUN THIS IF WRITES HAVE STOPPED WORKING. It puts the database back to the
-- permissive policies the app shipped with, so registration, catches,
-- check-ins, donations and director changes all work again immediately.
--
-- Safe to run at any time, in any state. Every statement is drop-if-exists
-- first, so it does not matter whether the step 2 policies were applied, half
-- applied, or never applied.
--
-- NOTHING IS LOST. The owner columns from PART A stay exactly where they are,
-- they simply stop being consulted. Re-applying step 2 later picks up where
-- this left off.
--
-- This returns the database to open access - the state described in
-- supabase-setup.sql section 2. Anyone with the page's anon key can read and
-- write these six tables. That is the trade the app was built on, and it is
-- what you were already running; this is a restore, not a downgrade.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. What is in force right now? Run this first if you want to see the damage.
--    Under open access you should end up with one *_public_rw row per table,
--    six in all, each cmd = ALL.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('anglers','catches','donations','messages','signals','config')
order by tablename, policyname;


-- ---------------------------------------------------------------------------
-- 2. Clear every policy this project might have on these tables, whichever
--    naming scheme created it.
-- ---------------------------------------------------------------------------
drop policy if exists anglers_public_rw   on public.anglers;
drop policy if exists anglers_read        on public.anglers;
drop policy if exists anglers_insert      on public.anglers;
drop policy if exists anglers_update      on public.anglers;
drop policy if exists anglers_delete      on public.anglers;

drop policy if exists catches_public_rw   on public.catches;
drop policy if exists catches_read        on public.catches;
drop policy if exists catches_insert      on public.catches;
drop policy if exists catches_update      on public.catches;
drop policy if exists catches_delete      on public.catches;

drop policy if exists donations_public_rw on public.donations;
drop policy if exists donations_read      on public.donations;
drop policy if exists donations_write     on public.donations;

drop policy if exists messages_public_rw  on public.messages;
drop policy if exists messages_read       on public.messages;
drop policy if exists messages_insert     on public.messages;
drop policy if exists messages_update     on public.messages;
drop policy if exists messages_delete     on public.messages;

drop policy if exists signals_public_rw   on public.signals;
drop policy if exists signals_read        on public.signals;
drop policy if exists signals_insert      on public.signals;
drop policy if exists signals_update      on public.signals;
drop policy if exists signals_delete      on public.signals;

drop policy if exists config_public_rw    on public.config;
drop policy if exists config_read         on public.config;
drop policy if exists config_write        on public.config;


-- ---------------------------------------------------------------------------
-- 3. Put open access back.
-- ---------------------------------------------------------------------------
alter table public.anglers   enable row level security;
alter table public.catches   enable row level security;
alter table public.donations enable row level security;
alter table public.messages  enable row level security;
alter table public.signals   enable row level security;
alter table public.config    enable row level security;

create policy anglers_public_rw on public.anglers
  for all to anon, authenticated
  using (true) with check (true);

create policy catches_public_rw on public.catches
  for all to anon, authenticated
  using (true) with check (true);

create policy donations_public_rw on public.donations
  for all to anon, authenticated
  using (true) with check (true);

create policy messages_public_rw on public.messages
  for all to anon, authenticated
  using (true) with check (true);

create policy signals_public_rw on public.signals
  for all to anon, authenticated
  using (true) with check (true);

create policy config_public_rw on public.config
  for all to anon, authenticated
  using (true) with check (true);


-- ---------------------------------------------------------------------------
-- 4. The photo bucket, same treatment. Upload uses x-upsert, which is an
--    update when the object already exists, so update needs its own policy.
-- ---------------------------------------------------------------------------
drop policy if exists catch_photos_read   on storage.objects;
drop policy if exists catch_photos_write  on storage.objects;
drop policy if exists catch_photos_update on storage.objects;
drop policy if exists catch_photos_delete on storage.objects;

create policy catch_photos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'catch-photos');

create policy catch_photos_write on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'catch-photos');

create policy catch_photos_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'catch-photos')
  with check (bucket_id = 'catch-photos');

create policy catch_photos_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'catch-photos');


-- ---------------------------------------------------------------------------
-- 5. Confirm. Six rows, all cmd = ALL, roles including anon.
-- ---------------------------------------------------------------------------
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('anglers','catches','donations','messages','signals','config')
order by tablename;

-- Then open the app and register a test angler. If that saves, you are back.
