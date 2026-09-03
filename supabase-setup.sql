-- ============================================================================
-- LiveWire - Montana Kayak Walleye Open
-- Supabase setup.
--
-- Plain statements only: no DO blocks, no functions, no dollar-quoted bodies.
-- Those carry semicolons inside them, which is what SQL editors trip over when
-- they split a script into statements. None of it was needed here.
--
-- HOW TO RUN
--   1. supabase.com -> your project -> SQL Editor -> New query.
--   2. Paste this whole file. Press Run.
--   3. Project Settings -> API. Copy "Project URL" and the "anon public" key
--      into livewire.html (SUPABASE_URL / SUPABASE_ANON_KEY near the top of
--      the script block).
--      Do NOT copy the service_role key. That one is a master key and must
--      never go into a page that ships to phones.
--
-- If a step ever fails, run the sections one at a time - they are independent
-- and every one of them is safe to run twice.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Tables
--    Each is an id plus a jsonb blob, so the app's record shapes can change
--    without a migration. created_at is for your reference; the app never
--    reads it.
-- ---------------------------------------------------------------------------
create table if not exists public.anglers (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.catches (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.donations (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.config (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 2. Row level security
--
--    READ THIS. The anon key ships inside the page, so anyone who has your
--    tournament link also has the key. These policies let that key read and
--    write these four tables and nothing else in your project.
--
--    For a catch-photo-release tournament where you review and approve every
--    catch before it scores, that is a reasonable trade: the worst a meddler
--    can do is create junk entries you then reject. It is NOT suitable for
--    anything you would be upset to see edited by a stranger.
-- ---------------------------------------------------------------------------
alter table public.anglers   enable row level security;
alter table public.catches   enable row level security;
alter table public.donations enable row level security;
alter table public.config    enable row level security;

drop policy if exists anglers_public_rw   on public.anglers;
drop policy if exists catches_public_rw   on public.catches;
drop policy if exists donations_public_rw on public.donations;
drop policy if exists config_public_rw    on public.config;

create policy anglers_public_rw on public.anglers
  for all to anon, authenticated
  using (true) with check (true);

create policy catches_public_rw on public.catches
  for all to anon, authenticated
  using (true) with check (true);

create policy donations_public_rw on public.donations
  for all to anon, authenticated
  using (true) with check (true);

create policy config_public_rw on public.config
  for all to anon, authenticated
  using (true) with check (true);


-- ---------------------------------------------------------------------------
-- 3. Photo storage bucket
--
--    You can do this in the dashboard instead if you prefer:
--      Storage -> New bucket -> name it exactly  catch-photos  -> tick Public.
--    The statement below does the same thing.
--
--    Public read means a photo is a plain <img src="...">, so phones and your
--    tablet get normal browser caching instead of re-downloading the image
--    data on every render.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('catch-photos', 'catch-photos', true, 5242880)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880;


-- ---------------------------------------------------------------------------
-- 4. Bucket policies
--    Upload uses x-upsert, which is an update when the object already exists
--    (a re-shoot of the same catch), so update needs its own policy.
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
-- 5. Check it worked
--    Run these two. The first should list four tables, the second one bucket.
-- ---------------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('anglers','catches','donations','config')
order by table_name;

select id, public, file_size_limit
from storage.buckets
where id = 'catch-photos';


-- ============================================================================
-- Handy queries for during and after the event.
-- Highlight one and press Run - the SQL editor runs just the selection.
-- ============================================================================

-- Everything still waiting on you:
--
-- select id,
--        data->>'anglerName' as angler,
--        data->>'length'     as inches,
--        to_timestamp((data->>'timestamp')::bigint / 1000) as submitted
-- from public.catches
-- where data->>'status' = 'pending'
-- order by submitted;

-- Final standings - longest approved walleye per angler:
--
-- select data->>'anglerName' as angler,
--        max((data->>'length')::numeric) as best_inches
-- from public.catches
-- where data->>'status' = 'approved'
--   and data->>'species' = 'Walleye'
-- group by 1
-- order by 2 desc;

-- Big Fish pot entrants:
--
-- select data->>'name' as angler, data->>'tournamentId' as entry
-- from public.anglers
-- where (data->>'bigfish')::boolean is true
-- order by 2;

-- Lock the tournament read-only once it is over. Run section 2 again to reopen.
--
-- drop policy if exists anglers_public_rw   on public.anglers;
-- drop policy if exists catches_public_rw   on public.catches;
-- drop policy if exists donations_public_rw on public.donations;
-- drop policy if exists config_public_rw    on public.config;
--
-- create policy anglers_read   on public.anglers   for select to anon, authenticated using (true);
-- create policy catches_read   on public.catches   for select to anon, authenticated using (true);
-- create policy donations_read on public.donations for select to anon, authenticated using (true);
-- create policy config_read    on public.config    for select to anon, authenticated using (true);

-- Wipe all entries for a fresh practice run (keeps the tables and policies):
--
-- delete from public.catches;
-- delete from public.anglers;
-- delete from public.donations;
-- delete from public.config;
