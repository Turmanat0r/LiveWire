-- ============================================================================
-- ##  STOP.  THIS DELETES EVERYTHING.  ##
--
-- This wipes EVERY angler, EVERY catch, EVERY donation and the whole chat,
-- for EVERY event,
-- from the shared tournament database. There is no undo, no recycle bin and no
-- confirmation prompt. Rows removed here are gone.
--
-- NEVER RUN THIS AGAINST REAL TOURNAMENT DATA.
--
-- It exists for one job: putting a TEST project back to empty between practice
-- runs. Before you press Run, satisfy yourself of all three:
--
--   1. This is a test/staging Supabase project, not the one anglers are using.
--   2. No live event is in progress, and none has been scored but not yet paid.
--   3. Anything you might still want - final standings, the payout sheet, the
--      roster - is already exported.
--
-- If you only want to clear ONE event and leave the others alone, do NOT use
-- this file. Use the per-event delete in supabase-setup.sql instead, which
-- filters on eventId.
--
-- Catch PHOTOS are not touched by this file. They live in the 'catch-photos'
-- storage bucket, not in these tables, so after running this you will have
-- orphaned images. See the note at the bottom for clearing those too.
--
-- HOW TO RUN
--   supabase.com -> your project -> SQL Editor -> New query -> paste -> Run.
--   Check the project name in the top-left corner FIRST.
-- ============================================================================


-- Uncomment this line to make the script refuse to run by default. Leaving it
-- commented is the convenience; uncommenting it is the seatbelt if you ever
-- have this file open next to a production project.
-- do $$ begin raise exception 'Safety catch is on - edit reset-test-data.sql to run.'; end $$;


-- ---------------------------------------------------------------------------
-- Look before you leap. Run this on its own first to see what you are about
-- to destroy. Highlight it and press Run - the editor runs just the selection.
-- ---------------------------------------------------------------------------
select 'anglers'   as table_name, count(*) as rows_to_delete from public.anglers
union all
select 'catches'   as table_name, count(*) from public.catches
union all
select 'donations' as table_name, count(*) from public.donations
union all
select 'messages'  as table_name, count(*) from public.messages
order by table_name;


-- ---------------------------------------------------------------------------
-- The wipe.
--
-- catches goes first: nothing enforces it, but deleting the children before
-- the parents keeps the intent readable and stays correct if a foreign key is
-- ever added.
--
-- config is deliberately NOT touched. It holds the live event, the target
-- species, the course boundary and the awards budgets - the setup you spent
-- time on, not test data. To reset that as well, uncomment the last statement.
-- ---------------------------------------------------------------------------
delete from public.messages;
delete from public.catches;
delete from public.anglers;
delete from public.donations;

-- Also throw away the director's setup (live event, target species, course
-- boundary, awards budgets). The app falls back to the values compiled into
-- index.html, so this is safe - just tedious to redo.
-- delete from public.config;


-- ---------------------------------------------------------------------------
-- Confirm it worked. All four counts should be 0.
-- ---------------------------------------------------------------------------
select 'anglers'   as table_name, count(*) as remaining from public.anglers
union all
select 'catches'   as table_name, count(*) from public.catches
union all
select 'donations' as table_name, count(*) from public.donations
union all
select 'messages'  as table_name, count(*) from public.messages
order by table_name;


-- ---------------------------------------------------------------------------
-- Orphaned photos.
--
-- The catch records are gone but their images are still in object storage,
-- billed and taking up space. Clearing them is a separate, equally permanent
-- step - which is why it is commented out.
--
-- Easier route: Storage -> catch-photos -> select all -> Delete.
--
-- delete from storage.objects where bucket_id = 'catch-photos';
-- ---------------------------------------------------------------------------
