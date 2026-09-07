-- ============================================================================
-- LiveWire - step 4: a catch photo cannot be swapped after it is filed
--
-- RUN THIS IN THE SUPABASE SQL EDITOR. Paste the whole file. It is safe to run
-- more than once, and safe to run mid-event.
--
--
-- WHAT IT FIXES
--
-- The app has never offered to replace a catch photo. An angler gets a length
-- edit and a withdraw on a pending catch, and nothing else.
--
-- The storage policies were looser than the app. Two gaps:
--
--   1. INSERT had no ownership condition at all - only `bucket_id`. Any signed-
--      in device could create <anyCatchId>.jpg as long as no object was there
--      yet. The window is real: a catch row is written BEFORE its photo (on
--      purpose - the update policy below can only ask "is this catch yours" if
--      the row exists), and on a weak signal the upload sits in the outbox for
--      as long as it takes. Anybody could have filled that gap with their own
--      picture.
--
--   2. UPDATE checked ownership but not status, so an angler could overwrite
--      their own photo at any time - including after the director had approved
--      it. The record keeps the length, the timestamp, the GPS fix, the
--      burned-in stamp and the first-pass measurements of the ORIGINAL photo,
--      and every one of them still reads as fine.
--
-- The app now re-hashes a stored photo as the director's review list draws it
-- and says so when it no longer matches the hash recorded at submission. That
-- catches a swap. This stops one.
--
--
-- WHY THE OFFLINE PATH STILL WORKS
--
-- This is the part worth being careful about, because a boat ramp with one bar
-- is the normal case, not the edge case.
--
-- A queued first upload is an INSERT: the object does not exist yet. The insert
-- policy below asks only that the catch is yours - not that it is still
-- pending - so a photo that sat in the outbox for an hour still lands, even if
-- the director has already ruled on the catch in the meantime.
--
-- Only REPLACING an object that already exists is an UPDATE, and that is the
-- one the status condition closes. A retry of a partly-completed upload happens
-- inside the pending window and is unaffected.
--
--
-- Status lives in the jsonb, not in a column - every table here is
-- (id text primary key, data jsonb, created_at, owner) - hence data->>'status'.
-- ============================================================================

drop policy if exists catch_photos_write  on storage.objects;
drop policy if exists catch_photos_update on storage.objects;

-- INSERT: the catch this photo belongs to has to exist and be yours.
-- Deliberately NOT conditioned on status, so an upload that has been sitting in
-- the outbox since before the director ruled still arrives.
create policy catch_photos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'catch-photos'
    and ( exists (select 1 from public.catches c
                  where c.id = split_part(storage.objects.name, '.', 1)
                    and c.owner = auth.uid())
          or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true' )
  );

-- UPDATE: yours, and only while the catch is still awaiting review. Once the
-- director has approved or rejected it, the evidence is fixed.
create policy catch_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'catch-photos'
    and ( exists (select 1 from public.catches c
                  where c.id = split_part(storage.objects.name, '.', 1)
                    and c.owner = auth.uid()
                    and c.data->>'status' = 'pending')
          or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true' )
  );

-- catch_photos_read and catch_photos_delete are left exactly as step 2b set
-- them. Reading is public because the gallery and the leaderboard are public,
-- and deletion already follows the catch: withdrawing removes the row and the
-- photo together.


-- ============================================================================
-- CHECK IT TOOK
--
--   select policyname, cmd from pg_policies
--    where tablename = 'objects' and policyname like 'catch_photos%'
--    order by policyname;
--
-- Four rows: read (SELECT), write (INSERT), update (UPDATE), delete (DELETE).
--
--
-- ROLLBACK
--
-- If photo uploads start failing mid-event and you need them working NOW, this
-- puts back exactly what step 2b had. It reopens gap 1 above; that is the right
-- trade at a boat ramp with a queue of anglers, and it can be tightened again
-- afterwards.
--
--   drop policy if exists catch_photos_write on storage.objects;
--   create policy catch_photos_write on storage.objects
--     for insert to authenticated
--     with check (bucket_id = 'catch-photos');
--
--   drop policy if exists catch_photos_update on storage.objects;
--   create policy catch_photos_update on storage.objects
--     for update to authenticated
--     using (
--       bucket_id = 'catch-photos'
--       and ( exists (select 1 from public.catches c
--                     where c.id = split_part(storage.objects.name, '.', 1)
--                       and c.owner = auth.uid())
--             or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true' )
--     );
-- ============================================================================
