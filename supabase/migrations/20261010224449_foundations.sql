-- Foundations: the private schema, the shared types, and the small checks every
-- other migration leans on.
--
-- HOW THIS DATABASE IS BUILT
--
-- Every table is readable through row-level security and writable by nobody.
-- Every change goes through a named function in `public` (register_entry,
-- file_catch, director_review_catch ...) that checks who is asking and what
-- they may do, then writes. The rules live here, once, instead of in every
-- phone.
--
-- What the field may see and what only an angler (and the director) may see
-- are kept in separate tables - anglers / angler_private, catches /
-- catch_evidence - so privacy is decided by which table a fact is in, not by
-- every screen remembering to hide it.
--
-- Errors carry a stable key as the message ('registration_closed') and a
-- sentence for people as the detail. The app branches on the key.

create schema if not exists private;
revoke all on schema private from public;
-- Row-level security calls the helpers in here as the signed-in user, so the
-- API roles need to be able to reach them. Nothing in private is exposed by
-- the API itself, which serves `public` only.
grant usage on schema private to anon, authenticated;

create type public.division as enum ('solo', 'team');
create type public.angler_role as enum ('solo', 'captain', 'partner');
create type public.catch_status as enum ('pending', 'approved', 'rejected');
create type public.photo_source as enum ('camera', 'upload');
create type public.bet_scoring as enum ('smallest', 'most', 'first', 'manual');
create type public.donation_target as enum ('solo', 'team', 'big_fish', 'general');
create type public.message_kind as enum ('chat', 'catch');

-- ---- who is asking -----------------------------------------------------------

-- Director status comes from app_metadata, which only the server can set.
-- user_metadata would be worthless: a client can write its own.
create function private.is_director()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'director') = 'true', false)
$$;

create function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_signed_in'
      using errcode = '28000',
            detail = 'This device has not finished signing in to the tournament yet.';
  end if;
  return v_user;
end;
$$;

create function private.require_director()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  if not private.is_director() then
    raise exception 'director_only'
      using errcode = '42501',
            detail = 'Only the tournament director can do this.';
  end if;
  return v_user;
end;
$$;

-- ---- values -------------------------------------------------------------------

-- Digits only, last ten: 406-555-0100, (406) 555 0100 and +1 4065550100 are one
-- number. Every entrant dials a North American number.
create function private.phone_digits(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)
$$;

-- Case and spacing do not make two people different people.
create function private.name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

-- Board codes are written on a wet bump board with a marker and read back off
-- a photo, so the alphabet has no two characters that look alike (no 0 1 2 5 8
-- B G I L O S U V Z). Four digits is the older form, and still valid.
create function private.is_board_code(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_code ~ '^([34679ACDEFHJKMNPQRTWXY]{4}|[0-9]{4})$'
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Personal and team codes share one pool, so a code on a board is never
-- ambiguous about what it is, and never belongs to two people across seasons.
create table private.board_codes (
  code text primary key check (private.is_board_code(code)),
  issued_at timestamptz not null default now()
);

create function private.issue_board_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '34679ACDEFHJKMNPQRTWXY';
  v_code text;
begin
  for attempt in 1..200 loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    insert into private.board_codes (code) values (v_code) on conflict do nothing;
    if found then
      return v_code;
    end if;
  end loop;
  raise exception 'no_board_code'
    using detail = 'Could not find an unused board code. Try again.';
end;
$$;

grant execute on function private.is_director() to anon, authenticated;
grant execute on function private.require_user() to authenticated;
grant execute on function private.require_director() to authenticated;
