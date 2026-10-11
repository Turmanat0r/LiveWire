-- Live updates: the database tells phones which rows changed, and each phone
-- reads those rows again through its own row-level security.
--
-- Stage 2 published whole rows through Postgres Changes, which delivers a
-- change only to phones allowed to see the row afterwards. When the director
-- overturns an approved catch, the field can no longer see it, so the field is
-- never told and the fish stays on every board. A signal that names the row,
-- and nothing more, reaches every phone; the phone asks for the row; the
-- server answers under its rules; a row that comes back missing is removed.
--
-- A signal carries the table and the row's key, never its contents. Rows only
-- their owner can read still signal on their event's topic, so a signed-in
-- phone can learn that an angler's check-in changed at 6:42, but not what it
-- says, where anyone is, or what they caught.
--
-- Topics: `events` for the list of events, `event:<id>` for everything in one
-- event. Signed-in phones may listen to both. Nothing lets a phone send on them.

-- ---- every row a phone holds names its event ---------------------------------------
-- So one rule routes every signal and one filter reads a whole event back. Two
-- tables reached their event through a parent; they now carry it, and the
-- foreign keys hold it to the parent's, so a side bet's entrant must be in the
-- bet's event.

alter table public.catches add constraint catches_id_event unique (id, event_id);
alter table public.catch_evidence add column event_id uuid;
update public.catch_evidence ce set event_id = c.event_id from public.catches c where c.id = ce.catch_id;
alter table public.catch_evidence
  alter column event_id set not null,
  drop constraint catch_evidence_catch_id_fkey,
  add constraint catch_evidence_catch_fkey foreign key (catch_id, event_id)
    references public.catches (id, event_id) on delete cascade;
create index catch_evidence_catch_event on public.catch_evidence (catch_id, event_id);

alter table public.bets add constraint bets_id_event unique (id, event_id);
alter table public.bet_entries add column event_id uuid;
update public.bet_entries be set event_id = b.event_id from public.bets b where b.id = be.bet_id;
alter table public.bet_entries
  alter column event_id set not null,
  drop constraint bet_entries_bet_id_fkey,
  drop constraint bet_entries_angler_id_fkey,
  add constraint bet_entries_bet_fkey foreign key (bet_id, event_id)
    references public.bets (id, event_id) on delete cascade,
  add constraint bet_entries_angler_fkey foreign key (angler_id, event_id)
    references public.anglers (id, event_id) on delete cascade;
create index bet_entries_bet_event on public.bet_entries (bet_id, event_id);
drop index public.bet_entries_angler;
create index bet_entries_angler_event on public.bet_entries (angler_id, event_id);

-- The two functions that add those rows, now filling in the event.
create or replace function public.file_catch(
  p_id uuid,
  p_angler_id uuid,
  p_species text,
  p_length_inches numeric,
  p_logged_at timestamptz,
  p_captured_at timestamptz default null,
  p_photo_source public.photo_source default null,
  p_clock_offset_ms integer default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_miles real default null,
  p_boundary jsonb default null,
  p_precheck jsonb default null
)
returns public.catches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers := private.require_can_act_for(p_angler_id);
  v_event public.events;
  v_catch public.catches;
begin
  select * into v_catch from public.catches where id = p_id;
  if found then
    if v_catch.angler_id = p_angler_id then
      return v_catch;
    end if;
    raise exception 'catch_id_taken' using errcode = '23505', detail = 'File the catch again.';
  end if;

  select * into v_event from public.events where id = v_angler.event_id;
  if v_event.archived then
    raise exception 'event_closed' using errcode = '22023', detail = 'This event is closed to new catches.';
  end if;
  if btrim(p_species) <> 'Other' and not exists (
    select 1 from public.event_species where event_id = v_angler.event_id and name = btrim(p_species)
  ) then
    raise exception 'unknown_species' using errcode = '22023',
      detail = 'That species is not on this event''s list. Choose it again.';
  end if;
  perform private.check_clock(p_logged_at);

  insert into public.catches (id, event_id, angler_id, division, species, length_inches, logged_at, photo_path)
    select p_id, v_angler.event_id, p_angler_id, e.division, btrim(p_species), p_length_inches, p_logged_at,
           v_angler.event_id || '/' || p_id || '.jpg'
    from public.entries e where e.id = v_angler.entry_id
  returning * into v_catch;

  insert into public.catch_evidence (
    catch_id, event_id, captured_at, photo_source, clock_offset_ms, lat, lng, accuracy_miles, boundary,
    precheck, filed_by, filed_by_director
  ) values (
    p_id, v_angler.event_id, p_captured_at, p_photo_source, p_clock_offset_ms, p_lat, p_lng, p_accuracy_miles,
    p_boundary, p_precheck, auth.uid(), private.is_director()
  );
  return v_catch;
end;
$$;

create or replace function public.join_bet(p_bet_id uuid, p_angler_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers := private.require_can_act_for(p_angler_id);
  v_bet public.bets := private.require_open_bet(p_bet_id);
begin
  if v_bet.event_id <> v_angler.event_id then
    raise exception 'bet_not_found' using errcode = 'P0002', detail = 'That side bet is not in your event.';
  end if;
  insert into public.bet_entries (bet_id, event_id, angler_id)
    values (p_bet_id, v_bet.event_id, p_angler_id)
    on conflict do nothing;
end;
$$;

-- ---- the signal -------------------------------------------------------------------------
-- The trigger's arguments name the columns that pick out the changed rows:
-- the primary key, or for entry_devices just the entry, so a signal never
-- carries a device's account id. An update that moves a row to another key or
-- event signals both places.

create function private.signal_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb[];
  v_row jsonb;
  v_key jsonb;
  v_column text;
  v_sent jsonb[] := '{}';
  v_signal jsonb;
begin
  v_rows := case tg_op
    when 'INSERT' then array[to_jsonb(new)]
    when 'DELETE' then array[to_jsonb(old)]
    else array[to_jsonb(new), to_jsonb(old)]
  end;
  foreach v_row in array v_rows loop
    v_key := '{}';
    foreach v_column in array tg_argv loop
      v_key := v_key || jsonb_build_object(v_column, v_row -> v_column);
    end loop;
    v_signal := jsonb_build_object(
      'topic', case when tg_table_name = 'events' then 'events' else 'event:' || (v_row ->> 'event_id') end,
      'table', tg_table_name,
      'key', v_key
    );
    if not v_signal = any (v_sent) then
      perform realtime.send(v_signal - 'topic', 'change', v_signal ->> 'topic', true);
      v_sent := v_sent || v_signal;
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function private.signal_change() from public, anon, authenticated;

create trigger signal after insert or update or delete on public.events
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.event_days
  for each row execute function private.signal_change('event_id', 'day');
create trigger signal after insert or update or delete on public.event_species
  for each row execute function private.signal_change('event_id', 'name');
create trigger signal after insert or update or delete on public.entries
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.entry_private
  for each row execute function private.signal_change('entry_id');
create trigger signal after insert or update or delete on public.anglers
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.angler_private
  for each row execute function private.signal_change('angler_id');
create trigger signal after insert or update or delete on public.entry_devices
  for each row execute function private.signal_change('entry_id');
create trigger signal after insert or update or delete on public.check_ins
  for each row execute function private.signal_change('angler_id', 'day');
create trigger signal after insert or update or delete on public.catches
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.catch_evidence
  for each row execute function private.signal_change('catch_id');
create trigger signal after insert or update or delete on public.positions
  for each row execute function private.signal_change('angler_id');
create trigger signal after insert or update or delete on public.beacons
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.messages
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.bets
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.bet_entries
  for each row execute function private.signal_change('bet_id', 'angler_id');
create trigger signal after insert or update or delete on public.donations
  for each row execute function private.signal_change('id');
create trigger signal after insert or update or delete on public.results
  for each row execute function private.signal_change('event_id');
create trigger signal after insert or update or delete on public.event_reports
  for each row execute function private.signal_change('event_id');

-- ---- who may listen ------------------------------------------------------------------
-- Realtime checks this when a phone joins a private channel. There is no
-- insert rule, so no phone can send a signal of its own.

create policy live_updates_listen on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) ~ '^(events|event:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
  );

-- ---- Postgres Changes off ---------------------------------------------------------------
-- One way to hear about changes, not two.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime drop table
      public.events, public.event_days, public.event_species,
      public.entries, public.entry_private, public.anglers, public.angler_private,
      public.check_ins, public.catches, public.catch_evidence,
      public.positions, public.beacons,
      public.messages, public.bets, public.bet_entries, public.donations, public.results;
  end if;
end;
$$;
