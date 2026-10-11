-- The board and the banter: chat, side bets, donations, frozen results, the
-- state report, and the pool totals the public payout screen shows.

-- ---- chat -----------------------------------------------------------------------------

create table public.messages (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  angler_id uuid references public.anglers (id) on delete set null,
  -- Copied when posted, so an old message keeps the name it was posted under.
  handle text not null,
  kind public.message_kind not null default 'chat',
  body text not null default '' check (char_length(body) <= 280),
  catch_id uuid references public.catches (id) on delete set null,
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'catch' or char_length(btrim(body)) > 0)
);
create index messages_event_time on public.messages (event_id, created_at);

-- ---- side bets ------------------------------------------------------------------------
-- The app keeps score, never money. Joining is its own row, so two anglers
-- joining at once cannot overwrite each other.

create table public.bets (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  creator_angler_id uuid not null references public.anglers (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 70),
  stake text not null default '' check (char_length(stake) <= 40),
  scoring public.bet_scoring not null,
  winner_angler_id uuid references public.anglers (id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index bets_event on public.bets (event_id);

create table public.bet_entries (
  bet_id uuid not null references public.bets (id) on delete cascade,
  angler_id uuid not null references public.anglers (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (bet_id, angler_id)
);

-- ---- money ------------------------------------------------------------------------------

create table public.donations (
  id uuid primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  target public.donation_target not null,
  amount_cents integer not null check (amount_cents > 0),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid
);
create index donations_event on public.donations (event_id);

-- ---- after the event ----------------------------------------------------------------------
-- A placing an angler was told on the day stays the placing they were told:
-- once frozen, the trophy case reads this rather than working it out again.

create table public.results (
  event_id uuid primary key references public.events (id) on delete cascade,
  record jsonb not null,
  frozen_at timestamptz not null default now(),
  frozen_by uuid
);

-- The Montana FWP contest report's fields, as the director last saved them.
create table public.event_reports (
  event_id uuid primary key references public.events (id) on delete cascade,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.messages enable row level security;
alter table public.bets enable row level security;
alter table public.bet_entries enable row level security;
alter table public.donations enable row level security;
alter table public.results enable row level security;
alter table public.event_reports enable row level security;

create policy messages_read on public.messages for select to authenticated using (true);
create policy bets_read on public.bets for select to authenticated using (true);
create policy bet_entries_read on public.bet_entries for select to authenticated using (true);
create policy donations_read on public.donations for select to authenticated using (true);
create policy results_read on public.results for select to anon, authenticated using (true);
create policy event_reports_read on public.event_reports for select to authenticated
  using (private.is_director());

revoke all on public.messages, public.bets, public.bet_entries, public.donations, public.results,
  public.event_reports from anon, authenticated;
grant select on public.messages, public.bets, public.bet_entries, public.donations,
  public.event_reports to authenticated;
grant select on public.results to anon, authenticated;

-- ---- chat ----------------------------------------------------------------------------------

-- A message, or a catch announced to the chat. Safe to repeat with the same id.
create function public.post_message(
  p_id uuid,
  p_angler_id uuid,
  p_body text,
  p_reply_to uuid default null,
  p_catch_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers := private.require_can_act_for(p_angler_id);
  v_message public.messages;
begin
  select * into v_message from public.messages where id = p_id;
  if found then
    return v_message;
  end if;
  if p_catch_id is not null and not exists (
    select 1 from public.catches where id = p_catch_id and angler_id = p_angler_id
  ) then
    raise exception 'not_your_catch' using errcode = '42501', detail = 'You can only announce your own catch.';
  end if;
  insert into public.messages (id, event_id, angler_id, handle, kind, body, reply_to, catch_id)
    values (p_id, v_angler.event_id, p_angler_id, v_angler.handle,
            case when p_catch_id is null then 'chat' else 'catch' end::public.message_kind,
            btrim(coalesce(p_body, '')), p_reply_to, p_catch_id)
  returning * into v_message;
  return v_message;
end;
$$;

create function public.delete_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages;
begin
  perform private.require_user();
  select * into v_message from public.messages where id = p_id;
  if not found then
    return;
  end if;
  if not private.is_director() and (v_message.angler_id is null or not private.can_act_for(v_message.angler_id)) then
    raise exception 'not_your_message' using errcode = '42501', detail = 'You can only delete your own messages.';
  end if;
  delete from public.messages where id = p_id;
end;
$$;

-- ---- side bets -------------------------------------------------------------------------------

create function public.create_bet(
  p_id uuid,
  p_angler_id uuid,
  p_title text,
  p_scoring public.bet_scoring,
  p_stake text default ''
)
returns public.bets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_angler public.anglers := private.require_can_act_for(p_angler_id);
  v_bet public.bets;
begin
  select * into v_bet from public.bets where id = p_id;
  if found then
    return v_bet;
  end if;
  -- So one person cannot flood the screen.
  if (select count(*) from public.bets
      where creator_angler_id = p_angler_id and winner_angler_id is null) >= 3 then
    raise exception 'too_many_open_bets' using errcode = '22023',
      detail = 'You already have three open side bets. Settle or delete one first.';
  end if;
  insert into public.bets (id, event_id, creator_angler_id, title, stake, scoring)
    values (p_id, v_angler.event_id, p_angler_id, btrim(p_title), btrim(coalesce(p_stake, '')), p_scoring)
  returning * into v_bet;
  return v_bet;
end;
$$;

create function private.require_open_bet(p_bet_id uuid)
returns public.bets
language plpgsql
stable
set search_path = ''
as $$
declare
  v_bet public.bets;
begin
  select * into v_bet from public.bets where id = p_bet_id;
  if not found then
    raise exception 'bet_not_found' using errcode = 'P0002', detail = 'That side bet is gone.';
  end if;
  if v_bet.winner_angler_id is not null then
    raise exception 'bet_settled' using errcode = '22023', detail = 'That side bet has already been called.';
  end if;
  return v_bet;
end;
$$;

create function public.join_bet(p_bet_id uuid, p_angler_id uuid)
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
  insert into public.bet_entries (bet_id, angler_id) values (p_bet_id, p_angler_id) on conflict do nothing;
end;
$$;

create function public.leave_bet(p_bet_id uuid, p_angler_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_can_act_for(p_angler_id);
  perform private.require_open_bet(p_bet_id);
  delete from public.bet_entries where bet_id = p_bet_id and angler_id = p_angler_id;
end;
$$;

-- Whoever started it calls it, or the director. The winner has to be in it.
create function public.settle_bet(p_bet_id uuid, p_winner_angler_id uuid)
returns public.bets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bet public.bets := private.require_open_bet(p_bet_id);
begin
  perform private.require_can_act_for(v_bet.creator_angler_id);
  if not exists (select 1 from public.bet_entries where bet_id = p_bet_id and angler_id = p_winner_angler_id) then
    raise exception 'winner_not_in_bet' using errcode = '22023', detail = 'The winner has to be in the bet.';
  end if;
  update public.bets set winner_angler_id = p_winner_angler_id, settled_at = now()
   where id = p_bet_id returning * into v_bet;
  return v_bet;
end;
$$;

create function public.delete_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bet public.bets;
begin
  select * into v_bet from public.bets where id = p_bet_id;
  if not found then
    return;
  end if;
  perform private.require_can_act_for(v_bet.creator_angler_id);
  delete from public.bets where id = p_bet_id;
end;
$$;

-- ---- money -------------------------------------------------------------------------------------

create function public.director_record_donation(
  p_id uuid, p_event_id uuid, p_target public.donation_target, p_amount_cents integer, p_note text default ''
)
returns public.donations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.donations;
begin
  perform private.require_director();
  insert into public.donations (id, event_id, target, amount_cents, note, created_by)
    values (p_id, p_event_id, p_target, p_amount_cents, btrim(coalesce(p_note, '')), auth.uid())
    on conflict (id) do nothing;
  select * into v_row from public.donations where id = p_id;
  return v_row;
end;
$$;

create function public.director_delete_donation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  delete from public.donations where id = p_id;
end;
$$;

-- What each pool is built from: entries whose fee has arrived. Counts only,
-- because who has paid is between the angler and the director.
create function public.pool_counts(p_event_id uuid)
returns table (
  solo_paid integer,
  teams_paid integer,
  big_fish_paid integer,
  solo_eligible integer,
  teams_eligible integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where e.division = 'solo')::integer,
    count(*) filter (where e.division = 'team')::integer,
    (select count(*) from public.anglers a
       join public.entry_private p on p.entry_id = a.entry_id
      where a.event_id = p_event_id and a.big_fish and p.fee_paid)::integer,
    count(*) filter (where e.division = 'solo'
      and exists (select 1 from public.anglers a where a.entry_id = e.id and not a.disqualified))::integer,
    count(*) filter (where e.division = 'team'
      and exists (select 1 from public.anglers a where a.entry_id = e.id and not a.disqualified))::integer
  from public.entries e
  join public.entry_private ep on ep.entry_id = e.id
  where e.event_id = p_event_id and ep.fee_paid
$$;

-- ---- after the event -------------------------------------------------------------------------------

create function public.director_freeze_results(p_event_id uuid, p_record jsonb)
returns public.results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.results;
begin
  perform private.require_director();
  insert into public.results (event_id, record, frozen_by) values (p_event_id, p_record, auth.uid())
  on conflict (event_id) do update set record = excluded.record, frozen_at = now(), frozen_by = excluded.frozen_by
  returning * into v_row;
  return v_row;
end;
$$;

create function public.director_unfreeze_results(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  delete from public.results where event_id = p_event_id;
end;
$$;

create function public.director_save_report(p_event_id uuid, p_settings jsonb)
returns public.event_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.event_reports;
begin
  perform private.require_director();
  insert into public.event_reports (event_id, settings) values (p_event_id, p_settings)
  on conflict (event_id) do update set settings = excluded.settings, updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Everything entered into an event - entries, catches, chat, bets, donations,
-- results - gone; the event itself and its setup stay. For test events.
create function public.director_clear_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  delete from public.messages where event_id = p_event_id;
  delete from public.bets where event_id = p_event_id;
  delete from public.donations where event_id = p_event_id;
  delete from public.results where event_id = p_event_id;
  delete from public.event_reports where event_id = p_event_id;
  delete from public.entries where event_id = p_event_id;
end;
$$;

-- An event with nothing in it can go entirely.
create function public.director_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  if exists (select 1 from public.entries where event_id = p_event_id) then
    raise exception 'event_has_entries' using errcode = '22023',
      detail = 'This event has entries. Clear its data first.';
  end if;
  if exists (select 1 from public.events where id = p_event_id and is_current) then
    raise exception 'event_is_current' using errcode = '22023',
      detail = 'This is the current event. Switch to another event first.';
  end if;
  delete from public.events where id = p_event_id;
end;
$$;
