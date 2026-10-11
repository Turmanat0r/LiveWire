-- Who may call what, and which tables push live updates.
--
-- Postgres lets everyone run a new function, and Supabase additionally grants
-- every function in `public` to the anonymous role. Neither is wanted: every
-- function here is for a signed-in device (each one checks further), and the
-- helpers in `private` are for row-level security alone.

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_director(),
  private.my_entry_ids(),
  private.can_act_for(uuid),
  private.can_see_catch(uuid),
  private.can_see_evidence(uuid),
  private.can_add_photo(text),
  private.can_see_photo(text),
  private.can_remove_photo(text)
to authenticated;

-- Phones subscribe to these instead of downloading every table every few
-- seconds. Each change is delivered only to subscribers whose row-level
-- security lets them see the row.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.events, public.event_days, public.event_species,
      public.entries, public.entry_private, public.anglers, public.angler_private,
      public.check_ins, public.catches, public.catch_evidence,
      public.positions, public.beacons,
      public.messages, public.bets, public.bet_entries, public.donations, public.results;
  end if;
end;
$$;
