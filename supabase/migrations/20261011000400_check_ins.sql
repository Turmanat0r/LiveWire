-- Check-ins: who launched and who came back, one row per angler per fishing
-- day. The overdue list at the final check-in is read off these, so this is
-- the safety record as much as an attendance one.
--
-- Times come from the phone, because a check-out filed with no signal still
-- has to say when it happened. The server records when it actually arrived.

create table public.check_ins (
  angler_id uuid not null,
  event_id uuid not null,
  day date not null,
  in_at timestamptz,
  out_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (angler_id, day),
  foreign key (angler_id, event_id) references public.anglers (id, event_id) on delete cascade,
  -- No cascade: dropping a day that has check-ins on it is refused.
  foreign key (event_id, day) references public.event_days (event_id, day),
  check (out_at is null or in_at is not null),
  check (out_at is null or out_at >= in_at)
);

create index check_ins_event_day on public.check_ins (event_id, day);

alter table public.check_ins enable row level security;
create policy check_ins_read on public.check_ins for select to authenticated
  using (private.can_act_for(angler_id));
revoke all on public.check_ins from anon, authenticated;
grant select on public.check_ins to authenticated;

-- A phone's clock may be a little ahead of the server's, not an hour.
create function private.check_clock(p_at timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at > now() + interval '5 minutes' then
    raise exception 'clock_ahead' using errcode = '22023',
      detail = 'This phone''s clock is ahead of the tournament server. Turn on automatic date and time.';
  end if;
end;
$$;

create function private.require_event_day(p_event_id uuid, p_day date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.event_days where event_id = p_event_id and day = p_day) then
    raise exception 'not_an_event_day' using errcode = '22023',
      detail = 'That day is not one of this event''s fishing days.';
  end if;
end;
$$;

-- Safe to repeat: the first check-in time stands.
create function public.check_in(p_angler_id uuid, p_day date, p_at timestamptz default now())
returns public.check_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers := private.require_can_act_for(p_angler_id);
  v_row public.check_ins;
begin
  perform private.require_event_day(v_angler.event_id, p_day);
  perform private.check_clock(p_at);
  insert into public.check_ins as c (angler_id, event_id, day, in_at, updated_by)
    values (p_angler_id, v_angler.event_id, p_day, p_at, auth.uid())
  on conflict (angler_id, day) do update
    set in_at = coalesce(c.in_at, excluded.in_at), updated_at = now(), updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;

-- Safe to repeat: the first check-out time stands.
create function public.check_out(p_angler_id uuid, p_day date, p_at timestamptz default now())
returns public.check_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.check_ins;
begin
  perform private.require_can_act_for(p_angler_id);
  perform private.check_clock(p_at);
  update public.check_ins
     set out_at = coalesce(out_at, greatest(p_at, in_at)), updated_at = now(), updated_by = auth.uid()
   where angler_id = p_angler_id and day = p_day and in_at is not null
  returning * into v_row;
  if not found then
    raise exception 'not_checked_in' using errcode = '22023',
      detail = 'There is no check-in to check out of for that day.';
  end if;
  return v_row;
end;
$$;

-- Put a day's record right: a check-out somebody forgot, or one made by
-- mistake. Null clears a time.
create function public.director_set_check_in(
  p_angler_id uuid, p_day date, p_in_at timestamptz, p_out_at timestamptz
)
returns public.check_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers;
  v_row public.check_ins;
begin
  perform private.require_director();
  select * into v_angler from public.anglers where id = p_angler_id;
  if not found then
    raise exception 'angler_not_found' using errcode = 'P0002', detail = 'There is no such angler.';
  end if;
  perform private.require_event_day(v_angler.event_id, p_day);
  insert into public.check_ins as c (angler_id, event_id, day, in_at, out_at, updated_by)
    values (p_angler_id, v_angler.event_id, p_day, p_in_at, p_out_at, auth.uid())
  on conflict (angler_id, day) do update
    set in_at = excluded.in_at, out_at = excluded.out_at, updated_at = now(), updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;
