-- ============================================================================
-- LiveWire - step 2b: ENFORCE ownership
--
--   ##  DO NOT PASTE AND RUN THIS FILE BLIND.  ##
--
-- This is the switch that starts refusing writes. Run it at the wrong moment
-- and every write in the app fails at once - registration, catches,
-- check-ins, donations, director changes. Reads keep working, so the app looks
-- healthy right up to the point where nothing saves.
--
-- WHY: the policies below are granted to the `authenticated` role. A device
-- using the shared anon key has the role `anon`, and matches none of them.
--
-- THE GATE. Run this first, on its own:
--
--     select count(*) filter (where is_anonymous) as anonymous_devices,
--            count(*) filter (where (raw_app_meta_data ->> 'director') = 'true')
--              as director_accounts
--     from auth.users;
--
--   anonymous_devices must be 1 or more. That is what proves devices are
--   getting real identities. If it is 0:
--     - enable Authentication -> Sign In / Providers -> Anonymous Sign-Ins
--     - then OPEN THE APP once, which is what creates the first identity
--     - then re-run the gate. Enabling alone does not create anything.
--
--   director_accounts must be 1, or you lock yourself out of your own
--   director tools. Create the account, set {"director": true} on its
--   app_metadata, and sign in once so the flag lands in a token.
--
-- Also confirm the app is running a build from 63faa64 or later. Earlier
-- builds upload a catch photo before writing its record, and the photo
-- policies here cannot authorise that.
--
-- IF IT GOES WRONG: run supabase-rollback-open-access.sql. It restores write
-- access immediately and loses nothing.
--
-- Existing records have owner NULL - every 2027 angler, catch and donation.
-- Under these policies only the director can edit them. That is deliberate:
-- those results are scored and should not be rewritable. To let anglers keep
-- editing their own older records, add  or owner is null  to the USING
-- clauses - but that means ANY device can edit ANY ownerless row, which is
-- where we started.
--
-- Director identity comes from app_metadata, which a client cannot write to.
-- user_metadata would be worthless: anyone could set it on themselves.
-- ============================================================================

-- ---- catches ----
drop policy if exists catches_public_rw on public.catches;
drop policy if exists catches_read      on public.catches;
drop policy if exists catches_insert    on public.catches;
drop policy if exists catches_update    on public.catches;
drop policy if exists catches_delete    on public.catches;

-- Reading stays open: the leaderboard is public and there is nothing sensitive
-- in a catch record.
create policy catches_read on public.catches
  for select to anon, authenticated
  using (true);

create policy catches_insert on public.catches
  for insert to authenticated
  with check (owner = auth.uid());

create policy catches_update on public.catches
  for update to authenticated
  using      (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true')
  with check (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');

create policy catches_delete on public.catches
  for delete to authenticated
  using (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');


-- ---- anglers ----
drop policy if exists anglers_public_rw on public.anglers;
drop policy if exists anglers_read      on public.anglers;
drop policy if exists anglers_insert    on public.anglers;
drop policy if exists anglers_update    on public.anglers;
drop policy if exists anglers_delete    on public.anglers;

create policy anglers_read on public.anglers
  for select to anon, authenticated
  using (true);

create policy anglers_insert on public.anglers
  for insert to authenticated
  with check (owner = auth.uid());

create policy anglers_update on public.anglers
  for update to authenticated
  using      (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true')
  with check (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');

create policy anglers_delete on public.anglers
  for delete to authenticated
  using (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');


-- ---- donations ----
-- Only the director logs these, so writing is director-only from the start.
drop policy if exists donations_public_rw on public.donations;
drop policy if exists donations_read      on public.donations;
drop policy if exists donations_write     on public.donations;

create policy donations_read on public.donations
  for select to anon, authenticated
  using (true);

create policy donations_write on public.donations
  for all to authenticated
  using      ((auth.jwt() -> 'app_metadata' ->> 'director') = 'true')
  with check ((auth.jwt() -> 'app_metadata' ->> 'director') = 'true');


-- ---- messages ----
-- Chat is readable by anyone who can see the tournament. You post as yourself
-- and may delete your own; the director can delete anything, which is the
-- moderation tool for when the razzing stops being funny.
drop policy if exists messages_public_rw on public.messages;
drop policy if exists messages_read      on public.messages;
drop policy if exists messages_insert    on public.messages;
drop policy if exists messages_update    on public.messages;
drop policy if exists messages_delete    on public.messages;

create policy messages_read on public.messages
  for select to anon, authenticated
  using (true);

create policy messages_insert on public.messages
  for insert to authenticated
  with check (owner = auth.uid());

-- No update policy on purpose: a message cannot be edited after posting, so it
-- cannot change out from under a reply that quoted it.
create policy messages_delete on public.messages
  for delete to authenticated
  using (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');


-- ---- signals ----
-- Read is NOT open here. An angler's position is competitive intelligence, so
-- only the director may read the table; the app filters beacons out of it for
-- everyone else, and this makes that a rule rather than a convention.
drop policy if exists signals_public_rw on public.signals;
drop policy if exists signals_read      on public.signals;
drop policy if exists signals_insert    on public.signals;
drop policy if exists signals_update    on public.signals;
drop policy if exists signals_delete    on public.signals;

create policy signals_read on public.signals
  for select to authenticated
  using (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');

create policy signals_insert on public.signals
  for insert to authenticated
  with check (owner = auth.uid());

create policy signals_update on public.signals
  for update to authenticated
  using      (owner = auth.uid())
  with check (owner = auth.uid());

create policy signals_delete on public.signals
  for delete to authenticated
  using (owner = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');


-- ---- config ----
-- Every device must READ this - it carries the live event, the target species
-- and the course boundary. Only the director may write it. Before this, any
-- stranger with the link could switch the live event mid-tournament.
drop policy if exists config_public_rw on public.config;
drop policy if exists config_read      on public.config;
drop policy if exists config_write     on public.config;

create policy config_read on public.config
  for select to anon, authenticated
  using (true);

create policy config_write on public.config
  for all to authenticated
  using      ((auth.jwt() -> 'app_metadata' ->> 'director') = 'true')
  with check ((auth.jwt() -> 'app_metadata' ->> 'director') = 'true');


-- ---- catch photos ----
-- Public read keeps photos as ordinary <img> sources with normal browser
-- caching. Overwrite and delete become owner-or-director, which is what stops
-- one angler swapping the evidence on another's scored catch.
--
-- NOTE: this depends on the client writing the catch row BEFORE uploading its
-- photo. The app currently uploads first, so the insert policy below cannot
-- check ownership - that reorder ships alongside PART B.
drop policy if exists catch_photos_read   on storage.objects;
drop policy if exists catch_photos_write  on storage.objects;
drop policy if exists catch_photos_update on storage.objects;
drop policy if exists catch_photos_delete on storage.objects;

create policy catch_photos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'catch-photos');

create policy catch_photos_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catch-photos');

create policy catch_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'catch-photos'
    and ( exists (select 1 from public.catches c
                  where c.id = split_part(storage.objects.name, '.', 1)
                    and c.owner = auth.uid())
          or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true' )
  );

create policy catch_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'catch-photos'
    and ( exists (select 1 from public.catches c
                  where c.id = split_part(storage.objects.name, '.', 1)
                    and c.owner = auth.uid())
          or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true' )
  );


-- ============================================================================
-- ROLLBACK
--
-- Run  supabase-rollback-open-access.sql.  Paste the whole file; it is safe in
-- any state and restores write access immediately.
--
-- Nothing is lost. The owner columns from step 2a stay exactly where they are,
-- they simply stop being consulted, so re-applying this file later picks up
-- where it left off.
--
-- Do not try to undo this by re-running supabase-setup.sql section 2 alone: it
-- does not drop the policies created here, and you would be left with both
-- sets in place.
-- ============================================================================
