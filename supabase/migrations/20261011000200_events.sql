-- Events: the tournament itself - its days, its water, its species, its fees
-- and its clock. These were constants in the old app's code; here the director
-- edits them, and every phone reads them.

-- The course, as the phone's geometry expects it (src/domain/geo.ts).
create function private.is_valid_course(p_course jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_point jsonb;
begin
  case p_course ->> 'kind'
    when 'none' then
      return true;
    when 'circle' then
      return jsonb_typeof(p_course -> 'center' -> 'lat') = 'number'
         and jsonb_typeof(p_course -> 'center' -> 'lng') = 'number'
         and (p_course -> 'center' ->> 'lat')::float8 between -90 and 90
         and (p_course -> 'center' ->> 'lng')::float8 between -180 and 180
         and jsonb_typeof(p_course -> 'radiusMiles') = 'number'
         and (p_course ->> 'radiusMiles')::float8 > 0;
    when 'polygon' then
      if jsonb_typeof(p_course -> 'points') <> 'array'
         or jsonb_array_length(p_course -> 'points') < 3 then
        return false;
      end if;
      for v_point in select value from jsonb_array_elements(p_course -> 'points') loop
        if jsonb_typeof(v_point -> 'lat') <> 'number' or jsonb_typeof(v_point -> 'lng') <> 'number'
           or (v_point ->> 'lat')::float8 not between -90 and 90
           or (v_point ->> 'lng')::float8 not between -180 and 180 then
          return false;
        end if;
      end loop;
      return true;
    else
      return false;
  end case;
end;
$$;

-- Shares in basis points (5000 = 50%), one per paid place, adding up to no
-- more than the whole pool.
create function private.is_valid_payout(p_shares integer[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_shares) between 1 and 10
     and coalesce((select bool_and(s > 0) and sum(s) <= 10000 from unnest(p_shares) s), false)
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  presenter text not null default '' check (char_length(presenter) <= 120),
  -- Leads every entry number this event hands out: MKWO-001.
  entry_prefix text not null check (entry_prefix ~ '^[A-Z0-9]{2,10}$'),
  time_zone text not null default 'America/Denver',
  registration_closes_at timestamptz not null,
  -- A fishing day, on the event's own clock.
  lines_in time not null default '07:00',
  lines_out time not null default '14:00',
  final_check_in time not null default '15:00',
  course jsonb not null default '{"kind": "none"}' check (private.is_valid_course(course)),
  course_label text not null default '' check (char_length(course_label) <= 120),
  course_label_long text not null default '' check (char_length(course_label_long) <= 200),
  fee_solo_cents integer not null default 3000 check (fee_solo_cents >= 0),
  fee_team_cents integer not null default 5000 check (fee_team_cents >= 0),
  fee_big_fish_cents integer not null default 1000 check (fee_big_fish_cents >= 0),
  payout_basis_points integer[] not null default '{5000,3000,2000}'
    check (private.is_valid_payout(payout_basis_points)),
  awards_budget_cents integer not null default 0 check (awards_budget_cents >= 0),
  -- The one event every phone is on. At most one, enforced by the index below.
  is_current boolean not null default false,
  -- Out of the director's list, with everything it holds kept.
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lines_in < lines_out and lines_out <= final_check_in),
  check (not (is_current and archived))
);

create unique index events_one_current on public.events ((true)) where is_current;

create function private.check_event_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'invalid_time_zone'
      using errcode = '22023',
            detail = format('%s is not a time zone this server knows.', new.time_zone);
  end if;
  return new;
end;
$$;

create trigger events_time_zone before insert or update of time_zone on public.events
  for each row execute function private.check_event_time_zone();
create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();

-- One row per fishing day. Check-ins point at these, so a check-in on a day
-- that is not part of the event cannot exist.
create table public.event_days (
  event_id uuid not null references public.events (id) on delete cascade,
  day date not null,
  primary key (event_id, day)
);

-- What scores, and the length past which a fish is implausible.
create table public.event_species (
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60 and lower(name) <> 'other'),
  record_inches numeric(5, 2) check (record_inches > 0),
  position smallint not null default 0,
  primary key (event_id, name)
);

alter table public.events enable row level security;
alter table public.event_days enable row level security;
alter table public.event_species enable row level security;

-- Public: the event is on the home screen before anyone has signed in.
create policy events_read on public.events for select to anon, authenticated using (true);
create policy event_days_read on public.event_days for select to anon, authenticated using (true);
create policy event_species_read on public.event_species for select to anon, authenticated using (true);

revoke all on public.events, public.event_days, public.event_species from anon, authenticated;
grant select on public.events, public.event_days, public.event_species to anon, authenticated;

-- ---- director: setting up an event ----------------------------------------------

create function public.director_save_event(
  p_id uuid,
  p_name text,
  p_entry_prefix text,
  p_time_zone text,
  p_registration_closes_at timestamptz,
  p_days date[],
  p_presenter text default '',
  p_lines_in time default '07:00',
  p_lines_out time default '14:00',
  p_final_check_in time default '15:00',
  p_course jsonb default '{"kind": "none"}',
  p_course_label text default '',
  p_course_label_long text default '',
  p_fee_solo_cents integer default 3000,
  p_fee_team_cents integer default 5000,
  p_fee_big_fish_cents integer default 1000,
  p_payout_basis_points integer[] default '{5000,3000,2000}',
  p_awards_budget_cents integer default 0
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_director();
  if cardinality(p_days) not between 1 and 7 then
    raise exception 'invalid_days' using errcode = '22023',
      detail = 'An event runs for one to seven days.';
  end if;

  insert into public.events as e (
    id, name, presenter, entry_prefix, time_zone, registration_closes_at,
    lines_in, lines_out, final_check_in, course, course_label, course_label_long,
    fee_solo_cents, fee_team_cents, fee_big_fish_cents, payout_basis_points, awards_budget_cents
  ) values (
    p_id, btrim(p_name), p_presenter, upper(btrim(p_entry_prefix)), p_time_zone, p_registration_closes_at,
    p_lines_in, p_lines_out, p_final_check_in, p_course, p_course_label, p_course_label_long,
    p_fee_solo_cents, p_fee_team_cents, p_fee_big_fish_cents, p_payout_basis_points, p_awards_budget_cents
  )
  on conflict (id) do update set
    name = excluded.name, presenter = excluded.presenter, entry_prefix = excluded.entry_prefix,
    time_zone = excluded.time_zone, registration_closes_at = excluded.registration_closes_at,
    lines_in = excluded.lines_in, lines_out = excluded.lines_out, final_check_in = excluded.final_check_in,
    course = excluded.course, course_label = excluded.course_label, course_label_long = excluded.course_label_long,
    fee_solo_cents = excluded.fee_solo_cents, fee_team_cents = excluded.fee_team_cents,
    fee_big_fish_cents = excluded.fee_big_fish_cents, payout_basis_points = excluded.payout_basis_points,
    awards_budget_cents = excluded.awards_budget_cents
  returning * into v_event;

  -- Days that have check-ins cannot be dropped: the foreign key refuses, and
  -- the director is told which day is in use.
  begin
    delete from public.event_days where event_id = p_id and day <> all (p_days);
  exception when foreign_key_violation then
    raise exception 'day_in_use' using errcode = '23503',
      detail = 'A day you removed already has check-ins on it.';
  end;
  insert into public.event_days (event_id, day)
    select p_id, d from unnest(p_days) d
    on conflict do nothing;

  return v_event;
end;
$$;

-- The species list, in order. The first one is the event's main species.
create function public.director_set_event_species(p_event_id uuid, p_species jsonb)
returns setof public.event_species
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  if jsonb_typeof(p_species) <> 'array' then
    raise exception 'invalid_species' using errcode = '22023',
      detail = 'Species must be a list of { name, recordInches }.';
  end if;
  delete from public.event_species where event_id = p_event_id;
  insert into public.event_species (event_id, name, record_inches, position)
    select p_event_id, btrim(s.value ->> 'name'), (s.value ->> 'recordInches')::numeric, (s.ordinality - 1)::smallint
    from jsonb_array_elements(p_species) with ordinality s;
  return query select * from public.event_species where event_id = p_event_id order by position;
end;
$$;

-- Switches every phone to this event.
create function public.director_set_current_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_director();
  update public.events set is_current = false where is_current and id <> p_event_id;
  update public.events set is_current = true, archived = false where id = p_event_id
    returning * into v_event;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002', detail = 'There is no such event.';
  end if;
  return v_event;
end;
$$;

create function public.director_archive_event(p_event_id uuid, p_archived boolean)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_director();
  update public.events set archived = p_archived
    where id = p_event_id and not (p_archived and is_current)
    returning * into v_event;
  if not found then
    raise exception 'cannot_archive' using errcode = '22023',
      detail = 'The current event cannot be archived. Switch to another event first.';
  end if;
  return v_event;
end;
$$;
