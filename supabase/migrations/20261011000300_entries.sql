-- Entries and anglers: who is fishing, and which devices act for them.
--
-- An ENTRY is one registration: a solo angler, or a team of two in one boat.
-- An ANGLER is one person on an entry. The field sees an angler's handle and
-- division; their real name, phone, emergency contact, board code and fee
-- status are in the *_private tables, readable only by their own devices and
-- the director.
--
-- A DEVICE is a signed-in phone (an anonymous Supabase user). Registering links
-- the phone to the entry; "sign in to my entry" (claim_entry) links another.
-- Any device on an entry may act for both anglers on it: a team is one boat,
-- and the captain's phone files the partner's fish.

-- One person across every event, keyed by phone number. Lets the trophy case
-- find your own past entries without any phone number ever reaching a phone.
create table private.people (
  id uuid primary key default gen_random_uuid(),
  phone_digits text not null unique check (phone_digits ~ '^[0-9]{10}$'),
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  entry_number integer not null check (entry_number > 0),
  division public.division not null,
  created_at timestamptz not null default now(),
  unique (event_id, entry_number),
  unique (id, event_id)
);

create table public.entry_private (
  entry_id uuid primary key,
  event_id uuid not null,
  team_code text unique references private.board_codes (code),
  fee_paid boolean not null default false,
  fee_paid_at timestamptz,
  foreign key (entry_id, event_id) references public.entries (id, event_id) on delete cascade
);

create table public.anglers (
  id uuid primary key,
  entry_id uuid not null,
  event_id uuid not null,
  role public.angler_role not null,
  handle text not null check (char_length(btrim(handle)) between 1 and 80),
  big_fish boolean not null default false,
  disqualified boolean not null default false,
  registered_at timestamptz not null default now(),
  foreign key (entry_id, event_id) references public.entries (id, event_id) on delete cascade,
  unique (id, event_id),
  unique (id, entry_id)
);

-- Two anglers sharing a handle would make the chat unreadable.
create unique index anglers_one_handle on public.anglers (event_id, lower(btrim(handle)));
create index anglers_entry on public.anglers (entry_id);

create table public.angler_private (
  angler_id uuid primary key,
  event_id uuid not null,
  person_id uuid references private.people (id),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 40),
  emergency_name text not null default '' check (char_length(emergency_name) <= 120),
  emergency_phone text not null default '' check (char_length(emergency_phone) <= 40),
  -- Asked at registration; only the state contest report reads it.
  resident boolean,
  angler_code text not null unique references private.board_codes (code),
  dq_reason text not null default '' check (char_length(dq_reason) <= 300),
  disqualified_at timestamptz,
  foreign key (angler_id, event_id) references public.anglers (id, event_id) on delete cascade
);

-- One entry per person per event, by name and by phone. The database has the
-- final say, so a stale roster on a phone cannot let a second entry through.
create unique index angler_private_one_name on public.angler_private (event_id, private.name_key(full_name));
create unique index angler_private_one_person on public.angler_private (event_id, person_id)
  where person_id is not null;

create table public.entry_devices (
  entry_id uuid not null,
  event_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Which angler on the entry this device belongs to: who it posts as, and
  -- whose catch the submit screen starts on.
  angler_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (entry_id, user_id),
  -- One entry per device per event.
  unique (event_id, user_id),
  foreign key (entry_id, event_id) references public.entries (id, event_id) on delete cascade,
  foreign key (angler_id, entry_id) references public.anglers (id, entry_id) on delete cascade
);

create index entry_devices_user on public.entry_devices (user_id);

-- Every attempt to claim an entry, so guessing codes is slow.
create table private.claim_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index claim_attempts_recent on private.claim_attempts (user_id, attempted_at);

-- ---- helpers row-level security calls ------------------------------------------
-- Security definer, so checking a device's links does not itself go through
-- row-level security (which would loop back here).

create function private.my_entry_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select entry_id from public.entry_devices where user_id = auth.uid()
$$;

-- May this device act for this angler: their own entry, or the director.
create function private.can_act_for(p_angler_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_director() or exists (
    select 1
    from public.anglers a
    join public.entry_devices d on d.entry_id = a.entry_id
    where a.id = p_angler_id and d.user_id = auth.uid()
  )
$$;

create function private.require_can_act_for(p_angler_id uuid)
returns public.anglers
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers;
begin
  perform private.require_user();
  select * into v_angler from public.anglers where id = p_angler_id;
  if not found then
    raise exception 'angler_not_found' using errcode = 'P0002',
      detail = 'That angler is not on the roster.';
  end if;
  if not private.can_act_for(p_angler_id) then
    raise exception 'not_your_entry' using errcode = '42501',
      detail = 'This device is not signed in to that entry. Open Register and choose "Sign in to my entry".';
  end if;
  return v_angler;
end;
$$;

grant execute on function private.my_entry_ids() to authenticated;
grant execute on function private.can_act_for(uuid) to authenticated;

alter table public.entries enable row level security;
alter table public.entry_private enable row level security;
alter table public.anglers enable row level security;
alter table public.angler_private enable row level security;
alter table public.entry_devices enable row level security;

create policy entries_read on public.entries for select to authenticated using (true);
create policy anglers_read on public.anglers for select to authenticated using (true);
create policy entry_private_read on public.entry_private for select to authenticated
  using (private.is_director() or entry_id in (select private.my_entry_ids()));
create policy angler_private_read on public.angler_private for select to authenticated
  using (private.can_act_for(angler_id));
create policy entry_devices_read on public.entry_devices for select to authenticated
  using (user_id = auth.uid() or private.is_director());

revoke all on public.entries, public.entry_private, public.anglers, public.angler_private,
  public.entry_devices from anon, authenticated;
grant select on public.entries, public.entry_private, public.anglers, public.angler_private,
  public.entry_devices to authenticated;

-- ---- registering -----------------------------------------------------------------

-- Everything a registration returns, and what "sign in to my entry" returns:
-- the entry, its codes, and its anglers. Only ever called for an entry the
-- caller may see.
create function private.entry_summary(p_entry_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'entryId', e.id,
    'eventId', e.event_id,
    'entryNumber', e.entry_number,
    'division', e.division,
    'teamCode', ep.team_code,
    'feePaid', ep.fee_paid,
    'anglers', (
      select jsonb_agg(jsonb_build_object(
          'id', a.id, 'role', a.role, 'handle', a.handle, 'anglerCode', ap.angler_code,
          'fullName', ap.full_name, 'bigFish', a.big_fish)
        order by a.role)
      from public.anglers a join public.angler_private ap on ap.angler_id = a.id
      where a.entry_id = e.id
    )
  )
  from public.entries e join public.entry_private ep on ep.entry_id = e.id
  where e.id = p_entry_id
$$;

-- One angler's part of a registration form, checked. Raises with the reason.
create function private.check_registrant(p jsonb, p_needs_phone boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p ->> 'id' is null then
    raise exception 'invalid_registration' using errcode = '22023', detail = 'Each angler needs an id.';
  end if;
  if char_length(btrim(coalesce(p ->> 'fullName', ''))) = 0 then
    raise exception 'name_required' using errcode = '22023', detail = 'Enter a name for every angler.';
  end if;
  if char_length(btrim(coalesce(p ->> 'handle', ''))) = 0 then
    raise exception 'handle_required' using errcode = '22023', detail = 'Every angler needs a handle.';
  end if;
  if p_needs_phone and length(private.phone_digits(p ->> 'phone')) < 10 then
    raise exception 'phone_required' using errcode = '22023',
      detail = 'Enter a complete phone number, area code included.';
  end if;
  if coalesce(p ->> 'phone', '') <> '' and length(private.phone_digits(p ->> 'phone')) < 10 then
    raise exception 'phone_incomplete' using errcode = '22023',
      detail = 'That phone number looks incomplete. Include the area code.';
  end if;
  if p_needs_phone then
    if char_length(btrim(coalesce(p ->> 'emergencyName', ''))) = 0
       or length(private.phone_digits(p ->> 'emergencyPhone')) < 10 then
      raise exception 'emergency_contact_required' using errcode = '22023',
        detail = 'Enter an emergency contact with a complete phone number.';
    end if;
    if private.phone_digits(p ->> 'emergencyPhone') = private.phone_digits(p ->> 'phone') then
      raise exception 'emergency_contact_is_self' using errcode = '22023',
        detail = 'Your emergency contact needs to be someone else, not your own number.';
    end if;
  end if;
  if jsonb_typeof(p -> 'resident') is distinct from 'boolean' then
    raise exception 'residency_required' using errcode = '22023',
      detail = 'Say whether each angler is a Montana resident. The state asks for the count.';
  end if;
end;
$$;

create function private.person_for_phone(p_phone text)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_digits text := private.phone_digits(p_phone);
  v_id uuid;
begin
  if length(v_digits) < 10 then
    return null;
  end if;
  insert into private.people (phone_digits) values (v_digits)
    on conflict (phone_digits) do update set phone_digits = excluded.phone_digits
    returning id into v_id;
  return v_id;
end;
$$;

create function private.add_angler(
  p_entry_id uuid, p_event_id uuid, p_role public.angler_role, p jsonb,
  p_emergency_name text, p_emergency_phone text
)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
begin
  insert into public.anglers (id, entry_id, event_id, role, handle, big_fish)
    values (v_id, p_entry_id, p_event_id, p_role, btrim(p ->> 'handle'), coalesce((p ->> 'bigFish')::boolean, false));
  insert into public.angler_private (
    angler_id, event_id, person_id, full_name, phone, emergency_name, emergency_phone, resident, angler_code
  ) values (
    v_id, p_event_id, private.person_for_phone(p ->> 'phone'), btrim(p ->> 'fullName'),
    coalesce(p ->> 'phone', ''), p_emergency_name, p_emergency_phone,
    (p ->> 'resident')::boolean, private.issue_board_code()
  );
  return v_id;
end;
$$;

-- Register a solo angler, or a team of two. Fields per angler: id, fullName,
-- phone, handle, bigFish, resident, emergencyName, emergencyPhone. A partner may
-- leave phone blank and shares the captain's emergency contact.
--
-- Safe to repeat: a retry with the same entry id (a phone that lost signal
-- mid-registration) returns the entry it already made.
create function public.register_entry(
  p_entry_id uuid,
  p_event_id uuid,
  p_division public.division,
  p_captain jsonb,
  p_partner jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_director boolean := private.is_director();
  v_event public.events;
  v_number integer;
  v_constraint text;
begin
  if exists (select 1 from public.entries where id = p_entry_id) then
    if v_director or p_entry_id in (select private.my_entry_ids()) then
      return private.entry_summary(p_entry_id);
    end if;
    raise exception 'entry_id_taken' using errcode = '23505', detail = 'Try registering again.';
  end if;

  -- Locking the event row serialises entry numbering.
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.archived then
    raise exception 'event_not_found' using errcode = 'P0002', detail = 'That event is not open.';
  end if;
  if now() >= v_event.registration_closes_at and not v_director then
    raise exception 'registration_closed' using errcode = '22023',
      detail = 'Registration has closed for this event. Contact the tournament director.';
  end if;
  -- The director registers people at the ramp, so their device holds no entry.
  if not v_director and exists (
    select 1 from public.entry_devices where event_id = p_event_id and user_id = v_user
  ) then
    raise exception 'device_already_registered' using errcode = '23505',
      detail = 'This device already holds an entry for this event. One entry per device.';
  end if;

  if (p_division = 'team') <> (p_partner is not null) then
    raise exception 'team_needs_partner' using errcode = '22023',
      detail = 'A team entry has exactly two anglers; a solo entry has one.';
  end if;
  perform private.check_registrant(p_captain, true);
  if p_partner is not null then
    perform private.check_registrant(p_partner, false);
    if private.name_key(p_partner ->> 'fullName') = private.name_key(p_captain ->> 'fullName') then
      raise exception 'team_needs_two_people' using errcode = '22023', detail = 'A team needs two different people.';
    end if;
    if private.phone_digits(p_partner ->> 'phone') = private.phone_digits(p_captain ->> 'phone') then
      raise exception 'team_needs_two_phones' using errcode = '22023',
        detail = 'A team needs two different phone numbers, or leave your partner''s blank.';
    end if;
  end if;

  select coalesce(max(entry_number), 0) + 1 into v_number from public.entries where event_id = p_event_id;

  begin
    insert into public.entries (id, event_id, entry_number, division)
      values (p_entry_id, p_event_id, v_number, p_division);
    insert into public.entry_private (entry_id, event_id, team_code)
      values (p_entry_id, p_event_id, case when p_division = 'team' then private.issue_board_code() end);
    perform private.add_angler(p_entry_id, p_event_id,
      case when p_division = 'team' then 'captain' else 'solo' end::public.angler_role,
      p_captain, btrim(p_captain ->> 'emergencyName'), p_captain ->> 'emergencyPhone');
    if p_partner is not null then
      perform private.add_angler(p_entry_id, p_event_id, 'partner', p_partner,
        btrim(p_captain ->> 'emergencyName'), p_captain ->> 'emergencyPhone');
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    case v_constraint
      when 'angler_private_one_name' then
        raise exception 'already_registered_name' using errcode = '23505',
          detail = 'Someone with that name is already entered in this event. Add a middle initial, or see the director.';
      when 'angler_private_one_person' then
        raise exception 'already_registered_phone' using errcode = '23505',
          detail = 'That phone number is already on the roster for this event. One entry per person.';
      when 'anglers_one_handle' then
        raise exception 'handle_taken' using errcode = '23505',
          detail = 'That handle was just taken. Roll a new one.';
      else
        raise;
    end case;
  end;

  if not v_director then
    insert into public.entry_devices (entry_id, event_id, user_id, angler_id)
      values (p_entry_id, p_event_id, v_user, (p_captain ->> 'id')::uuid);
  end if;
  return private.entry_summary(p_entry_id);
end;
$$;

-- "Sign in to my entry": bring an entry onto this device with the board code
-- and the phone number on the entry (or the teammate's). Neither is published.
-- Returns the entry, or null when nothing matches - without saying which half
-- was wrong.
create function public.claim_entry(p_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_digits text := private.phone_digits(p_phone);
  v_angler public.anglers;
begin
  if (select count(*) from private.claim_attempts
      where user_id = v_user and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000',
      detail = 'Too many tries from this device. Wait an hour, or see the director.';
  end if;
  insert into private.claim_attempts (user_id) values (v_user);

  if length(v_digits) < 10 or not private.is_board_code(v_code) then
    return null;
  end if;

  select a.* into v_angler
  from public.angler_private ap
  join public.anglers a on a.id = ap.angler_id
  where ap.angler_code = v_code
    and exists (
      select 1
      from public.anglers mate
      join public.angler_private mp on mp.angler_id = mate.id
      join private.people p on p.id = mp.person_id
      where mate.entry_id = a.entry_id and p.phone_digits = v_digits
    );
  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.entry_devices
    where event_id = v_angler.event_id and user_id = v_user and entry_id <> v_angler.entry_id
  ) then
    raise exception 'device_has_other_entry' using errcode = '23505',
      detail = 'This device is signed in to a different entry in this event. Sign out of it first.';
  end if;

  insert into public.entry_devices (entry_id, event_id, user_id, angler_id)
    values (v_angler.entry_id, v_angler.event_id, v_user, v_angler.id)
    on conflict (entry_id, user_id) do update set angler_id = excluded.angler_id;
  return private.entry_summary(v_angler.entry_id) || jsonb_build_object('anglerId', v_angler.id);
end;
$$;

-- Take this device off an entry. The entry itself is untouched.
create function public.leave_entry(p_entry_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.entry_devices where entry_id = p_entry_id and user_id = auth.uid()
$$;

-- Every angler, in every event, who is the same person as one of this
-- device's anglers. The trophy case reads your history through this; the
-- phone numbers that join them never leave the database.
create function public.my_history_angler_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct other.angler_id
  from public.entry_devices d
  join public.anglers mine on mine.entry_id = d.entry_id
  join public.angler_private mp on mp.angler_id = mine.id
  join public.angler_private other on other.person_id = mp.person_id
  where d.user_id = auth.uid() and mp.person_id is not null
$$;

-- ---- director: managing the roster -----------------------------------------------

create function public.director_set_fee_paid(p_entry_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  update public.entry_private
     set fee_paid = p_paid, fee_paid_at = case when p_paid then now() end
   where entry_id = p_entry_id;
  if not found then
    raise exception 'entry_not_found' using errcode = 'P0002', detail = 'There is no such entry.';
  end if;
end;
$$;

-- Out of the standings, the Big Fish pot and any payout placing. The fee stays
-- in the pool and the catches stay on record. The angler is told the reason.
create function public.director_disqualify(p_angler_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  update public.anglers set disqualified = true where id = p_angler_id;
  if not found then
    raise exception 'angler_not_found' using errcode = 'P0002', detail = 'There is no such angler.';
  end if;
  update public.angler_private
     set dq_reason = left(btrim(coalesce(p_reason, '')), 300), disqualified_at = now()
   where angler_id = p_angler_id;
end;
$$;

create function public.director_reinstate(p_angler_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  update public.anglers set disqualified = false where id = p_angler_id;
  update public.angler_private set dq_reason = '', disqualified_at = null where angler_id = p_angler_id;
end;
$$;

create function public.director_update_angler(
  p_angler_id uuid,
  p_full_name text,
  p_phone text,
  p_handle text,
  p_big_fish boolean,
  p_resident boolean,
  p_emergency_name text,
  p_emergency_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_constraint text;
begin
  perform private.require_director();
  begin
    update public.anglers set handle = btrim(p_handle), big_fish = p_big_fish where id = p_angler_id;
    if not found then
      raise exception 'angler_not_found' using errcode = 'P0002', detail = 'There is no such angler.';
    end if;
    update public.angler_private set
      full_name = btrim(p_full_name), phone = coalesce(p_phone, ''),
      person_id = private.person_for_phone(p_phone), resident = p_resident,
      emergency_name = coalesce(p_emergency_name, ''), emergency_phone = coalesce(p_emergency_phone, '')
    where angler_id = p_angler_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    raise exception '%', case v_constraint
        when 'angler_private_one_name' then 'already_registered_name'
        when 'angler_private_one_person' then 'already_registered_phone'
        when 'anglers_one_handle' then 'handle_taken'
        else 'duplicate' end
      using errcode = '23505', detail = 'Another angler in this event already has that.';
  end;
end;
$$;

-- Removes an entry and everything filed against it.
create function public.director_remove_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  delete from public.entries where id = p_entry_id;
end;
$$;
