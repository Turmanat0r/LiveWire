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
--
--    MORE THAN ONE EVENT SHARES THESE TABLES. Every angler, catch and donation
--    carries  data->>'eventId'  naming the tournament it belongs to, and the
--    app only ever reads the one that is live. So the queries below all filter
--    on it - leave the filter off and you are looking at every event at once.
--
--    Records written before the app knew about events have NO eventId at all.
--    Those belong to the first event in the EVENTS list in index.html
--    ('mkwo-2027'), which is why the queries below match it with
--    coalesce(data->>'eventId', 'mkwo-2027').
--
--    config holds one row, id 'tournament', and it is the only thing the
--    director's settings live in:
--      activeEventId  - which event every device is currently running
--      awardsBudgets  - { "<eventId>": number }
--      eventSettings  - { "<eventId>": { targetSpecies, recordInches, course } }
--    where course is either
--      {"kind":"circle","center":{"lat":..,"lng":..},"radiusMiles":..}
--      {"kind":"polygon","points":[{"lat":..,"lng":..}, ...]}
--      {"kind":"none"}
--    Anything absent falls back to the EVENTS entry compiled into index.html.
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

create table if not exists public.messages (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- One row per angler, keyed by their angler id: their last known position and
-- whether they have a beacon raised. Overwritten rather than appended, so this
-- stays the size of the field.
create table if not exists public.signals (
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
--    write these six tables and nothing else in your project.
--
--    For a catch-photo-release tournament where you review and approve every
--    catch before it scores, that is a reasonable trade: the worst a meddler
--    can do is create junk entries you then reject. It is NOT suitable for
--    anything you would be upset to see edited by a stranger.
-- ---------------------------------------------------------------------------
alter table public.anglers   enable row level security;
alter table public.catches   enable row level security;
alter table public.donations enable row level security;
alter table public.messages  enable row level security;
alter table public.signals   enable row level security;
alter table public.config    enable row level security;

drop policy if exists anglers_public_rw   on public.anglers;
drop policy if exists catches_public_rw   on public.catches;
drop policy if exists donations_public_rw on public.donations;
drop policy if exists messages_public_rw  on public.messages;
drop policy if exists signals_public_rw   on public.signals;
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
--    Run these two. The first should list six tables, the second one bucket.
-- ---------------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('anglers','catches','donations','messages','signals','config')
order by table_name;

select id, public, file_size_limit
from storage.buckets
where id = 'catch-photos';


-- ============================================================================
-- Handy queries for during and after the event.
-- Highlight one and press Run - the SQL editor runs just the selection.
--
-- Set the event once here, then the queries below all follow it. Change the id
-- to look at a different year. (Postgres has no client variables in this
-- editor, so the id is written into each query - it is the string in the
-- coalesce(...) = '...' line.)
-- ============================================================================

-- Which event is live, and what each one holds:
--
-- select coalesce(data->>'eventId', 'mkwo-2027') as event,
--        count(*) filter (where true) as records
-- from (
--   select data from public.anglers
--   union all select data from public.catches
--   union all select data from public.donations
-- ) all_rows
-- group by 1
-- order by 1;
--
-- select data->>'activeEventId' as live_event,
--        data->'awardsBudgets'  as budgets,
--        data->'eventSettings'  as settings
-- from public.config where id = 'tournament';

-- The species and boundary in force for one event:
--
-- select data->'eventSettings'->'mkwo-2027'->>'targetSpecies' as species,
--        data->'eventSettings'->'mkwo-2027'->'course'         as boundary
-- from public.config where id = 'tournament';

-- Catches logged outside the course boundary:
--
-- select data->>'anglerName' as angler,
--        data->>'length'     as inches,
--        round((data->'location'->>'outsideMiles')::numeric, 2) as miles_out
-- from public.catches
-- where (data->'location'->>'withinBounds')::boolean is false
--   and coalesce(data->>'eventId', 'mkwo-2027') = 'mkwo-2027'
-- order by miles_out desc;

-- Everything still waiting on you:
--
-- select id,
--        data->>'anglerName' as angler,
--        data->>'length'     as inches,
--        to_timestamp((data->>'timestamp')::bigint / 1000) as submitted
-- from public.catches
-- where data->>'status' = 'pending'
--   and coalesce(data->>'eventId', 'mkwo-2027') = 'mkwo-2027'
-- order by submitted;

-- Final standings - longest approved fish of the SCORING species per angler.
-- The species is whatever the director set for the event (Director -> Event);
-- change the string below to match it, or read it with the query above.
--
-- select data->>'anglerName' as angler,
--        max((data->>'length')::numeric) as best_inches
-- from public.catches
-- where data->>'status' = 'approved'
--   and data->>'species' = 'Walleye'
--   and coalesce(data->>'eventId', 'mkwo-2027') = 'mkwo-2027'
-- group by 1
-- order by 2 desc;

-- Big Fish pot entrants:
--
-- select data->>'name' as angler, data->>'tournamentId' as entry
-- from public.anglers
-- where (data->>'bigfish')::boolean is true
--   and coalesce(data->>'eventId', 'mkwo-2027') = 'mkwo-2027'
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

-- Wipe ONE event - a practice run, or last year's field once you have exported
-- it. Every other event is left alone. Change the id in all three lines.
--
-- delete from public.catches   where coalesce(data->>'eventId', 'mkwo-2027') = 'mkwo-2027';
-- delete from public.anglers   where coalesce(data->>'eventId', 'mkwo-2027') = 'mkwo-2027';
-- delete from public.donations where coalesce(data->>'eventId', 'mkwo-2027') = 'mkwo-2027';

-- Wipe EVERYTHING, every event, for a completely fresh start:
--
-- delete from public.catches;
-- delete from public.anglers;
-- delete from public.donations;
-- delete from public.config;
