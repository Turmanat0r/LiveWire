-- Safety: where anglers last were, and beacons.
--
-- A POSITION is recorded only when the phone already took a fix for its own
-- reasons (filing a catch, checking where it is), plus every minute while a
-- beacon is up. Only the angler and the director see it: in a fishing
-- tournament, where someone is fishing is competitive intelligence.
--
-- A BEACON is an angler asking for help. Every signed-in phone sees an active
-- one, because the nearest help on a reservoir is another kayak, not someone
-- on shore. Stood-down beacons are kept as the day's safety record.

create table public.positions (
  angler_id uuid primary key,
  event_id uuid not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_miles real check (accuracy_miles >= 0),
  recorded_at timestamptz not null,
  updated_at timestamptz not null default now(),
  foreign key (angler_id, event_id) references public.anglers (id, event_id) on delete cascade
);

create table public.beacons (
  id uuid primary key default gen_random_uuid(),
  angler_id uuid not null,
  event_id uuid not null,
  note text not null default '' check (char_length(note) <= 140),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_miles real check (accuracy_miles >= 0),
  position_at timestamptz not null,
  raised_at timestamptz not null default now(),
  stood_down_at timestamptz,
  stood_down_by uuid,
  foreign key (angler_id, event_id) references public.anglers (id, event_id) on delete cascade
);

-- At most one beacon up per angler.
create unique index beacons_one_active on public.beacons (angler_id) where stood_down_at is null;
create index beacons_event_active on public.beacons (event_id) where stood_down_at is null;

alter table public.positions enable row level security;
alter table public.beacons enable row level security;
create policy positions_read on public.positions for select to authenticated
  using (private.can_act_for(angler_id));
create policy beacons_read on public.beacons for select to authenticated
  using (stood_down_at is null or private.can_act_for(angler_id));
revoke all on public.positions, public.beacons from anon, authenticated;
grant select on public.positions, public.beacons to authenticated;

-- Keeps the newest fix. An active beacon moves with it.
create function public.record_position(
  p_angler_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_miles real default null,
  p_at timestamptz default now()
)
returns public.positions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers := private.require_can_act_for(p_angler_id);
  v_row public.positions;
begin
  perform private.check_clock(p_at);
  insert into public.positions as p (angler_id, event_id, lat, lng, accuracy_miles, recorded_at)
    values (p_angler_id, v_angler.event_id, p_lat, p_lng, p_accuracy_miles, p_at)
  on conflict (angler_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_miles = excluded.accuracy_miles,
        recorded_at = excluded.recorded_at, updated_at = now()
    where excluded.recorded_at >= p.recorded_at
  returning * into v_row;

  update public.beacons
     set lat = p_lat, lng = p_lng, accuracy_miles = p_accuracy_miles, position_at = p_at
   where angler_id = p_angler_id and stood_down_at is null and position_at <= p_at;

  if v_row is null then
    select * into v_row from public.positions where angler_id = p_angler_id;
  end if;
  return v_row;
end;
$$;

-- Raise a beacon, or update the note on one that is already up. A beacon needs
-- a position: one that points nowhere sends help to the wrong water.
create function public.raise_beacon(
  p_angler_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_miles real default null,
  p_at timestamptz default now(),
  p_note text default ''
)
returns public.beacons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers := private.require_can_act_for(p_angler_id);
  v_beacon public.beacons;
begin
  perform public.record_position(p_angler_id, p_lat, p_lng, p_accuracy_miles, p_at);
  update public.beacons set note = left(coalesce(p_note, ''), 140)
   where angler_id = p_angler_id and stood_down_at is null
  returning * into v_beacon;
  if not found then
    insert into public.beacons (angler_id, event_id, note, lat, lng, accuracy_miles, position_at)
      values (p_angler_id, v_angler.event_id, left(coalesce(p_note, ''), 140), p_lat, p_lng, p_accuracy_miles, p_at)
    returning * into v_beacon;
  end if;
  return v_beacon;
end;
$$;

-- The angler, once safe - or the director, once they have been reached.
create function public.stand_down_beacon(p_angler_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_can_act_for(p_angler_id);
  update public.beacons set stood_down_at = now(), stood_down_by = auth.uid()
   where angler_id = p_angler_id and stood_down_at is null;
end;
$$;
