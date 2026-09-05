-- ============================================================================
-- LiveWire - let one angler use their entry from more than one device
--
-- WHY
-- Every device signs in anonymously and gets its own auth.uid(). The step 2
-- policies say you may edit a row when owner = auth.uid(), so an entry made in
-- the mobile browser cannot be checked in or amended from the installed
-- home-screen app - a different storage container, a different anonymous user,
-- the same person.
--
-- Two pieces here:
--   1. co_owners, so an entry can answer to more than one device. Nobody loses
--      access when a second one is added, which a straight owner swap would do.
--   2. claim_entry(), which adds the calling device to an entry after checking
--      the board code AND the phone number on it. Two pieces of information,
--      neither of which is published anywhere.
--
-- RUN THE WHOLE FILE. It contains a function, so run it in one go rather than
-- statement by statement.
--
-- Requires step 2a and 2b to have been run first. Safe to re-run.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The extra owners.
--
--    An array rather than a second column: an angler may reasonably have a
--    phone, a tablet and the installed app, and there is no natural limit.
-- ---------------------------------------------------------------------------
alter table public.anglers add column if not exists co_owners uuid[] not null default '{}';
alter table public.catches add column if not exists co_owners uuid[] not null default '{}';

create index if not exists anglers_co_owners_idx on public.anglers using gin (co_owners);


-- ---------------------------------------------------------------------------
-- 2. Policies that consult it.
--
--    Replaces the step 2b versions. Same rules, plus "or this device has been
--    added to the entry".
--
--    A catch is editable by whoever controls the ANGLER it belongs to, not
--    only by the device that happened to file it. Otherwise claiming an entry
--    on a new phone would leave the catches taken on the old one uneditable,
--    which is the half-working state this file exists to avoid.
-- ---------------------------------------------------------------------------
drop policy if exists anglers_update on public.anglers;
drop policy if exists anglers_delete on public.anglers;

create policy anglers_update on public.anglers
  for update to authenticated
  using      (owner = auth.uid()
              or auth.uid() = any (co_owners)
              or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true')
  with check (owner = auth.uid()
              or auth.uid() = any (co_owners)
              or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');

create policy anglers_delete on public.anglers
  for delete to authenticated
  using (owner = auth.uid()
         or auth.uid() = any (co_owners)
         or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true');

drop policy if exists catches_update on public.catches;
drop policy if exists catches_delete on public.catches;

create policy catches_update on public.catches
  for update to authenticated
  using      (owner = auth.uid()
              or auth.uid() = any (co_owners)
              or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true'
              or exists (select 1 from public.anglers a
                          where a.id = public.catches.data->>'anglerId'
                            and (a.owner = auth.uid() or auth.uid() = any (a.co_owners))))
  with check (owner = auth.uid()
              or auth.uid() = any (co_owners)
              or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true'
              or exists (select 1 from public.anglers a
                          where a.id = public.catches.data->>'anglerId'
                            and (a.owner = auth.uid() or auth.uid() = any (a.co_owners))));

create policy catches_delete on public.catches
  for delete to authenticated
  using (owner = auth.uid()
         or auth.uid() = any (co_owners)
         or (auth.jwt() -> 'app_metadata' ->> 'director') = 'true'
         or exists (select 1 from public.anglers a
                     where a.id = public.catches.data->>'anglerId'
                       and (a.owner = auth.uid() or auth.uid() = any (a.co_owners))));


-- ---------------------------------------------------------------------------
-- 3. The claim itself.
--
--    security definer because the calling device does NOT yet have permission
--    to write the row - granting it that permission is the whole job. Which is
--    exactly why the checks inside are the only thing standing between an
--    angler and someone else's entry, and why there are two of them:
--
--      the board code   4 characters, on their bump board, not published
--      the phone number the one they registered with
--
--    A team partner may have registered without a phone of their own, so their
--    captain's number is accepted for their record too - a team shares a boat
--    and an entry fee, and the alternative is a partner who can never claim.
--
--    search_path is pinned. A security definer function that resolves table
--    names through a caller-controlled search_path is a way into the database.
-- ---------------------------------------------------------------------------
create or replace function public.claim_entry(p_code text, p_phone text)
returns text
language sql
security definer
set search_path = public, pg_temp
as $claim$
  with digits as (
    select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as phone
  ),
  target as (
    select a.id
    from public.anglers a, digits d
    where length(d.phone) = 10
      and upper(btrim(coalesce(a.data->>'anglerCode', ''))) = upper(btrim(coalesce(p_code, '')))
      and coalesce(a.data->>'anglerCode', '') <> ''
      and (
        right(regexp_replace(coalesce(a.data->>'phone', ''), '\D', '', 'g'), 10) = d.phone
        or exists (
          select 1 from public.anglers mate
          where mate.data->>'teamId' is not null
            and mate.data->>'teamId' = a.data->>'teamId'
            and right(regexp_replace(coalesce(mate.data->>'phone', ''), '\D', '', 'g'), 10) = d.phone
        )
      )
    limit 1
  )
  update public.anglers a
     set co_owners = (
           select array_agg(distinct x)
           from unnest(a.co_owners || array[auth.uid()]) as x
           where x is not null
         )
    from target t
   where a.id = t.id
     and auth.uid() is not null
  returning a.id;
$claim$;

revoke all on function public.claim_entry(text, text) from public;
grant execute on function public.claim_entry(text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. Check it took.
--    First query: two columns exist. Second: four policies. Third: the
--    function, with prosecdef = true.
-- ---------------------------------------------------------------------------
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and column_name = 'co_owners'
order by table_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and policyname in ('anglers_update','anglers_delete','catches_update','catches_delete')
order by tablename, policyname;

select proname, prosecdef
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'claim_entry';


-- ---------------------------------------------------------------------------
-- 5. To undo. The columns can stay - nothing breaks by leaving them - so this
--    only puts the step 2b policies back and removes the function.
--
-- drop function if exists public.claim_entry(text, text);
--
--    Then re-run supabase-step2b-enforce-policies.sql, which recreates
--    anglers_update, anglers_delete, catches_update and catches_delete in
--    their owner-only form.
-- ---------------------------------------------------------------------------
