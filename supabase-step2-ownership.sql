-- ============================================================================
-- LiveWire - step 2: ownership
--
-- Split deliberately. PART A is safe to run right now and changes no
-- behaviour. PART B is the switch that starts enforcing, and must NOT be run
-- until anonymous sign-in is confirmed working - see the check below.
--
-- WHY THE ORDER MATTERS
--   PART B's policies are granted to the `authenticated` role. If devices are
--   still using the shared anon key their role is `anon`, and every write in
--   the app would start failing - registration, catches, check-ins, the lot.
--   Running the check first is not bureaucracy; it is the difference between a
--   migration and an outage.
--
-- Plain statements only, matching supabase-setup.sql: no DO blocks, no
-- functions, no dollar-quoted bodies.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- CHECK FIRST. Run this on its own.
--
-- anonymous_devices should be 1 or more, and should go up when you load the
-- app on another phone. If it is 0, anonymous sign-in is not on yet: go to
-- Authentication -> Sign In / Providers -> Anonymous Sign-Ins and enable it.
--
-- director_accounts should be 1, and is the user carrying {"director": true}.
-- ---------------------------------------------------------------------------
select
  count(*) filter (where is_anonymous)                                as anonymous_devices,
  count(*) filter (where (raw_app_meta_data ->> 'director') = 'true') as director_accounts,
  count(*)                                                            as total_users,
  max(created_at)                                                     as newest_signin
from auth.users;

-- If the query above errors on is_anonymous (older Supabase), use this instead:
--
-- select count(*) as total_users, count(email) as with_email from auth.users;
--   with_email counts real accounts; the rest are anonymous devices.


-- ============================================================================
-- PART A - safe now. Adds the column the policies will read.
--
-- No policy looks at `owner` yet, so nothing changes: reads, writes and
-- deletes all behave exactly as they do today. New rows written by a signed-in
-- device get stamped; rows written on the shared key get NULL, as do all the
-- rows that already exist.
--
-- The default is what makes the app's upserts work without a client change -
-- the write body only ever carries id and data, so `owner` fills itself in.
-- ============================================================================

alter table public.anglers   add column if not exists owner uuid default auth.uid();
alter table public.catches   add column if not exists owner uuid default auth.uid();
alter table public.donations add column if not exists owner uuid default auth.uid();

create index if not exists anglers_owner_idx   on public.anglers   (owner);
create index if not exists catches_owner_idx   on public.catches   (owner);
create index if not exists donations_owner_idx on public.donations (owner);

-- Watch it working: load the app on a phone, register, then run this. The new
-- row should carry an owner once anonymous sign-in is on, and NULL before.
--
-- select id, owner, data ->> 'name' as name, created_at
-- from public.anglers order by created_at desc limit 5;


-- ============================================================================
-- PART B - the switch. Do NOT run until anonymous_devices above is non-zero.
--
-- Existing records have owner NULL. That includes every 2027 angler, catch and
-- donation. Under these policies an ordinary angler cannot edit an ownerless
-- row - only the director can. That is deliberate: those results are scored
-- and should not be rewritable. To let anglers keep editing their own older
-- records instead, add  or owner is null  to the USING clauses below - but be
-- aware that means ANY device can edit ANY ownerless row, which is where we
-- started.
--
-- Director identity comes from app_metadata, which a client cannot write to.
-- user_metadata would be worthless here: anyone could set it on themselves.
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
-- ROLLBACK. If PART B goes wrong, this puts everything back to open access and
-- the app works again immediately. Nothing is lost - the owner columns stay,
-- they just stop being consulted.
--
-- Re-run section 2 of supabase-setup.sql, which recreates the *_public_rw
-- policies, then section 4 for the bucket.
-- ============================================================================
