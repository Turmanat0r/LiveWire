-- ============================================================================
-- LiveWire - one entry per person, enforced by the database
--
-- WHY
-- The app already refuses a second entry for the same name. That check runs on
-- the phone, against the roster the phone has loaded, which makes it a guard
-- and not a boundary: a browser that has not finished syncing sees an empty
-- roster and lets the entry through. That is exactly how one person ended up
-- registered twice from two browsers.
--
-- This index is the boundary. The database refuses the second row whatever the
-- phone believed at the time.
--
-- HOW TO RUN
--   1. Run section 1 FIRST. If it returns any rows, fix those before going on -
--      creating the index will fail while duplicates exist, and it will tell
--      you so rather than doing anything destructive.
--   2. Then run section 2.
--
-- Nothing here deletes anything, and section 3 undoes it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Are there duplicates already? Run this on its own.
--
--    Names are compared the way the app compares them: trimmed, collapsed
--    runs of whitespace, case-insensitive. "ann  MILLER " and "Ann Miller"
--    are the same person here, which is the point.
--
--    Expect zero rows. Anything listed is two records for one person in one
--    event - decide which is real, delete the other (there is a delete in
--    supabase-setup.sql, or use the director's Contestants tool), then re-run
--    this until it comes back empty.
-- ---------------------------------------------------------------------------
select coalesce(data->>'eventId', 'mkwo-2027')                        as event,
       lower(regexp_replace(btrim(data->>'name'), '\s+', ' ', 'g'))   as person,
       count(*)                                                       as entries,
       array_agg(id)                                                  as record_ids,
       array_agg(data->>'tournamentId')                               as entry_ids
from public.anglers
where data->>'name' is not null
  and btrim(data->>'name') <> ''
group by 1, 2
having count(*) > 1
order by 1, 2;


-- ---------------------------------------------------------------------------
-- 2. The constraint.
--
--    Scoped per event, because the same angler SHOULD be able to enter next
--    year's tournament. Partner records are covered too - a partner is a
--    person, and a person entered as somebody's partner must not also hold
--    their own entry.
--
--    If this errors with "could not create unique index", section 1 has rows.
--    Go back and clear them; nothing has been changed by the failure.
-- ---------------------------------------------------------------------------
create unique index if not exists anglers_one_entry_per_person
  on public.anglers (
    coalesce(data->>'eventId', 'mkwo-2027'),
    lower(regexp_replace(btrim(data->>'name'), '\s+', ' ', 'g'))
  )
  where data->>'name' is not null
    and btrim(data->>'name') <> '';


-- ---------------------------------------------------------------------------
-- 2b. Board codes, same treatment.
--
--     A duplicate code is worse than a duplicate entry: it makes a catch photo
--     unattributable, and nothing looks wrong until two anglers claim one fish.
--     Codes are unique across ALL events on purpose - a code read off a board
--     must never belong to one angler this year and someone else last year.
-- ---------------------------------------------------------------------------
create unique index if not exists anglers_unique_angler_code
  on public.anglers ((data->>'anglerCode'))
  where data->>'anglerCode' is not null
    and data->>'anglerCode' <> '';


-- ---------------------------------------------------------------------------
-- 3. Check it took. Two rows.
-- ---------------------------------------------------------------------------
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'anglers'
  and indexname in ('anglers_one_entry_per_person', 'anglers_unique_angler_code')
order by indexname;


-- ---------------------------------------------------------------------------
-- 4. To undo, if a real event ever needs two records for one name and you
--    would rather sort it out afterwards than block someone at the ramp:
--
-- drop index if exists public.anglers_one_entry_per_person;
-- drop index if exists public.anglers_unique_angler_code;
--
--    The app's own check still runs either way, so dropping these puts you
--    back where you were - guarded, not enforced.
-- ---------------------------------------------------------------------------
