-- Tuning, from Supabase's advisors run against staging after stage 2.
--
-- 1. Three access rules asked "who is this, and are they the director" once
--    per row. Wrapped in a sub-select, Postgres asks once per request.
-- 2. Every link between tables gets an index that covers it, so removing an
--    entry or clearing a test event never has to scan whole tables. Two older
--    single-column indexes are covered by the new ones and go.
-- 3. The claim-attempts log gets a primary key, like every other table.
--
-- The advisors also list every function in `public` as "callable by signed-in
-- users with elevated rights". That is the design, not a finding: those
-- functions are the only way to change anything, each checks who is asking,
-- and tests/db proves the checks.

drop policy entry_devices_read on public.entry_devices;
create policy entry_devices_read on public.entry_devices for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_director()));

drop policy entry_private_read on public.entry_private;
create policy entry_private_read on public.entry_private for select to authenticated
  using ((select private.is_director()) or entry_id in (select private.my_entry_ids()));

drop policy event_reports_read on public.event_reports;
create policy event_reports_read on public.event_reports for select to authenticated
  using ((select private.is_director()));

create index angler_private_angler_event on public.angler_private (angler_id, event_id);
create index angler_private_person on public.angler_private (person_id);
create index anglers_entry_event on public.anglers (entry_id, event_id);
drop index public.anglers_entry;
create index beacons_angler_event on public.beacons (angler_id, event_id);
create index bet_entries_angler on public.bet_entries (angler_id);
create index bets_creator on public.bets (creator_angler_id);
create index bets_winner on public.bets (winner_angler_id);
create index catches_angler_event on public.catches (angler_id, event_id);
drop index public.catches_angler;
create index check_ins_angler_event on public.check_ins (angler_id, event_id);
create index entry_devices_angler_entry on public.entry_devices (angler_id, entry_id);
create index entry_devices_entry_event on public.entry_devices (entry_id, event_id);
create index entry_private_entry_event on public.entry_private (entry_id, event_id);
create index messages_angler on public.messages (angler_id);
create index messages_catch on public.messages (catch_id);
create index messages_reply_to on public.messages (reply_to);
create index positions_angler_event on public.positions (angler_id, event_id);

alter table private.claim_attempts add column id bigint generated always as identity primary key;
