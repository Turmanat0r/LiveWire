-- Who an angler in trouble can text: the director's number for this event.
--
-- A text often gets out where data will not, so the safety screen offers one
-- with the angler's position filled in. The number is read only by phones
-- signed in to an entry in the event, and by the director: anyone can open
-- the app, and a director's mobile should not be on every phone that does.
--
-- Also: positions and beacons stop refusing a phone whose clock is fast (at
-- the end of this file).

create table public.event_safety (
  event_id uuid primary key references public.events (id) on delete cascade,
  contact_name text not null default 'Tournament director'
    check (char_length(btrim(contact_name)) between 1 and 60),
  phone text not null check (length(private.phone_digits(phone)) = 10),
  updated_at timestamptz not null default now()
);

create trigger event_safety_touch before update on public.event_safety
  for each row execute function private.touch_updated_at();
create trigger signal after insert or update or delete on public.event_safety
  for each row execute function private.signal_change('event_id');

alter table public.event_safety enable row level security;
create policy event_safety_read on public.event_safety for select to authenticated
  using (
    private.is_director() or exists (
      select 1 from public.entries e
      where e.event_id = event_safety.event_id and e.id in (select private.my_entry_ids())
    )
  );
revoke all on public.event_safety from anon, authenticated;
grant select on public.event_safety to authenticated;

-- Set the number, or clear it with an empty one.
create function public.director_set_safety_contact(
  p_event_id uuid,
  p_phone text,
  p_contact_name text default 'Tournament director'
)
returns setof public.event_safety
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'event_not_found' using errcode = 'P0002', detail = 'There is no such event.';
  end if;
  if btrim(coalesce(p_phone, '')) = '' then
    delete from public.event_safety where event_id = p_event_id;
    return;
  end if;
  if length(private.phone_digits(p_phone)) < 10 then
    raise exception 'phone_incomplete' using errcode = '22023',
      detail = 'That phone number looks incomplete. Include the area code.';
  end if;
  return query
    insert into public.event_safety as s (event_id, contact_name, phone)
      values (p_event_id, coalesce(nullif(btrim(p_contact_name), ''), 'Tournament director'), btrim(p_phone))
    on conflict (event_id) do update
      set contact_name = excluded.contact_name, phone = excluded.phone
    returning s.*;
end;
$$;

revoke execute on function public.director_set_safety_contact(uuid, text, text) from public, anon;
grant execute on function public.director_set_safety_contact(uuid, text, text) to authenticated;

-- A position is never refused for the phone's clock. A beacon has to go up
-- whatever time the phone thinks it is, and a fix stamped in the future would
-- otherwise hold off every real fix after it. A time ahead of the server's is
-- taken as now.
create or replace function public.record_position(
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
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_row public.positions;
begin
  insert into public.positions as p (angler_id, event_id, lat, lng, accuracy_miles, recorded_at)
    values (p_angler_id, v_angler.event_id, p_lat, p_lng, p_accuracy_miles, v_at)
  on conflict (angler_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy_miles = excluded.accuracy_miles,
        recorded_at = excluded.recorded_at, updated_at = now()
    where excluded.recorded_at >= p.recorded_at
  returning * into v_row;

  update public.beacons
     set lat = p_lat, lng = p_lng, accuracy_miles = p_accuracy_miles, position_at = v_at
   where angler_id = p_angler_id and stood_down_at is null and position_at <= v_at;

  if v_row is null then
    select * into v_row from public.positions where angler_id = p_angler_id;
  end if;
  return v_row;
end;
$$;

create or replace function public.raise_beacon(
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
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_beacon public.beacons;
begin
  perform public.record_position(p_angler_id, p_lat, p_lng, p_accuracy_miles, v_at);
  update public.beacons set note = left(coalesce(p_note, ''), 140)
   where angler_id = p_angler_id and stood_down_at is null
  returning * into v_beacon;
  if not found then
    insert into public.beacons (angler_id, event_id, note, lat, lng, accuracy_miles, position_at)
      values (p_angler_id, v_angler.event_id, left(coalesce(p_note, ''), 140), p_lat, p_lng, p_accuracy_miles, v_at)
    returning * into v_beacon;
  end if;
  return v_beacon;
end;
$$;
