-- Clears the OLD app out of the production project, once, at switch-over, so
-- the new app's database can be built in its place. Daniel's decision: the
-- old database only ever held testing, so production starts empty.
--
-- Run it in the production project's SQL editor (paste the whole file, Run).
-- It runs as one transaction: if anything fails, nothing has changed.
--
-- It removes:
--   * every table, view, function and type the old app made in `public`
--     (anglers, catches, config, signals, ... and their triggers and policies);
--   * every rule on photos and buckets, including the old ones that let any
--     phone read every photo in a PUBLIC bucket. Rules add up, so one left
--     behind would sit beside the new private ones and still let it all out;
--   * every phone's anonymous sign-in, so no device carries an old identity in.
-- It keeps:
--   * director accounts (email and password). The new app reads the same
--     director flag, so the director signs in exactly as before;
--   * Supabase's own schemas, and the photo bucket itself, which the new
--     database makes private again. Its old photos are removed from the
--     dashboard (see SWITCH-OVER.md); the database will not delete them.
begin;

do $$
begin
  -- event_days exists only in the new app. Finding it means this has already
  -- been done and the new database built: stop before wiping it.
  if to_regclass('public.event_days') is not null then
    raise exception 'This project already has the new app''s database. Nothing was changed.';
  end if;
end;
$$;

do $$
declare
  r record;
begin
  -- Photo and bucket rules. Supabase itself ships none.
  for r in select policyname, tablename from pg_policies where schemaname = 'storage' loop
    execute format('drop policy %I on storage.%I', r.policyname, r.tablename);
  end loop;

  -- The old app's views, tables (with their triggers and policies) and
  -- sequences. Anything an extension owns is left to the extension.
  for r in
    select c.oid::regclass as name, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('v', 'm', 'r', 'p', 'f', 'S')
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
     order by case c.relkind when 'v' then 0 when 'm' then 1 else 2 end
  loop
    -- An earlier drop's cascade may have taken it already.
    continue when to_regclass(r.name::text) is null;
    execute format(
      'drop %s if exists %s cascade',
      case r.relkind
        when 'v' then 'view'
        when 'm' then 'materialized view'
        when 'f' then 'foreign table'
        when 'S' then 'sequence'
        else 'table'
      end,
      r.name);
  end loop;

  -- Its functions: claim_entry, the director-field guards, and the rest.
  for r in
    select p.oid::regprocedure as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop routine if exists %s cascade', r.name);
  end loop;

  -- Its own types, if it made any.
  for r in
    select t.oid::regtype as name
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typtype in ('e', 'd', 'c')
       and (t.typtype <> 'c' or (select relkind from pg_class where oid = t.typrelid) = 'c')
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e')
  loop
    execute format('drop type if exists %s cascade', r.name);
  end loop;
end;
$$;

-- The new app keeps its row-security helpers here. The old app never made
-- this schema; if anything is in it, it is in the way.
drop schema if exists private cascade;

-- Every phone signs itself in afresh with the new app.
delete from auth.users where is_anonymous;

commit;

-- What is left, for the record. Expect no rows in the first two, and only
-- director accounts in the third.
select 'table left in public' as what, tablename::text as name
  from pg_tables where schemaname = 'public'
union all
select 'photo rule left', policyname::text
  from pg_policies where schemaname = 'storage'
union all
select 'account kept', coalesce(email, id::text)
  from auth.users;
