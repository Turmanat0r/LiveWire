-- Catches, and their photos.
--
-- `catches` holds what the board needs: who, what, how long, when, and whether
-- the director has ruled on it. The field sees approved fish; an angler sees
-- all of their own; the director sees everything.
--
-- `catch_evidence` holds where it was caught, the photo's measurements, the
-- stamp, and the review notes. Where a fish was caught is competitive
-- intelligence, so only the angler and the director ever see it.
--
-- An angler files, fixes the length while it is pending, or withdraws it.
-- Only the director rules on it, and a ruled catch is the director's alone.

create table public.catches (
  -- Made by the phone, so a catch filed with no signal keeps the same id when
  -- it is finally sent, and sending it twice files it once.
  id uuid primary key,
  event_id uuid not null,
  angler_id uuid not null,
  division public.division not null,
  species text not null check (char_length(btrim(species)) between 1 and 60),
  length_inches numeric(5, 2) not null check (length_inches > 0 and length_inches < 100),
  -- When the phone filed it. Every ranking breaks a tie on the earliest fish.
  logged_at timestamptz not null,
  -- When the server received it, which is later if it waited for signal.
  received_at timestamptz not null default now(),
  status public.catch_status not null default 'pending',
  photo_path text not null,
  updated_at timestamptz not null default now(),
  foreign key (angler_id, event_id) references public.anglers (id, event_id) on delete cascade
);

create index catches_event_status on public.catches (event_id, status);
create index catches_angler on public.catches (angler_id);
create unique index catches_photo_path on public.catches (photo_path);

create trigger catches_touch before update on public.catches
  for each row execute function private.touch_updated_at();

create table public.catch_evidence (
  catch_id uuid primary key references public.catches (id) on delete cascade,
  -- The stamp burned into the photo, kept beside it.
  captured_at timestamptz,
  photo_source public.photo_source,
  clock_offset_ms integer,
  -- Where it was caught, and what the phone made of that against the course.
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy_miles real check (accuracy_miles >= 0),
  boundary jsonb,
  -- The photo's measurements: fingerprints, brightness, sharpness, size.
  precheck jsonb,
  filed_by uuid,
  filed_by_director boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text not null default '' check (char_length(review_note) <= 500),
  ai_review jsonb,
  check ((lat is null) = (lng is null))
);

-- Who may see a catch: approved fish are the field's; the rest are the
-- angler's and the director's.
create function private.can_see_catch(p_catch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.catches c
    where c.id = p_catch_id and (c.status = 'approved' or private.can_act_for(c.angler_id))
  )
$$;

create function private.can_see_evidence(p_catch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.catches c where c.id = p_catch_id and private.can_act_for(c.angler_id)
  )
$$;

grant execute on function private.can_see_catch(uuid) to authenticated;
grant execute on function private.can_see_evidence(uuid) to authenticated;

alter table public.catches enable row level security;
alter table public.catch_evidence enable row level security;
create policy catches_read on public.catches for select to authenticated
  using (status = 'approved' or private.can_act_for(angler_id));
create policy catch_evidence_read on public.catch_evidence for select to authenticated
  using (private.can_see_evidence(catch_id));
revoke all on public.catches, public.catch_evidence from anon, authenticated;
grant select on public.catches, public.catch_evidence to authenticated;

create function private.require_pending(p_catch_id uuid)
returns public.catches
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_catch public.catches;
begin
  select * into v_catch from public.catches where id = p_catch_id;
  if not found then
    raise exception 'catch_not_found' using errcode = 'P0002', detail = 'There is no such catch.';
  end if;
  perform private.require_can_act_for(v_catch.angler_id);
  if v_catch.status <> 'pending' then
    raise exception 'catch_already_reviewed' using errcode = '42501',
      detail = 'The director has already ruled on this catch, so it cannot be changed.';
  end if;
  return v_catch;
end;
$$;

-- File a catch. Safe to repeat with the same id: the first filing stands.
-- The photo goes to storage afterwards, at the path this returns; the storage
-- rules below accept it only for a pending catch this device may act for.
create function public.file_catch(
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
    catch_id, captured_at, photo_source, clock_offset_ms, lat, lng, accuracy_miles, boundary, precheck,
    filed_by, filed_by_director
  ) values (
    p_id, p_captured_at, p_photo_source, p_clock_offset_ms, p_lat, p_lng, p_accuracy_miles, p_boundary, p_precheck,
    auth.uid(), private.is_director()
  );
  return v_catch;
end;
$$;

create function public.amend_catch_length(p_id uuid, p_length_inches numeric)
returns public.catches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catch public.catches;
begin
  perform private.require_pending(p_id);
  update public.catches set length_inches = p_length_inches where id = p_id returning * into v_catch;
  return v_catch;
end;
$$;

-- Withdraw a pending catch. The app removes its photo from storage FIRST,
-- while the catch is still pending - the storage rules below only let the
-- angler's device remove a photo whose pending catch still exists.
create function public.withdraw_catch(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_pending(p_id);
  delete from public.catches where id = p_id;
end;
$$;

-- ---- director: ruling on catches ---------------------------------------------------

create function private.require_catch(p_id uuid)
returns public.catches
language plpgsql
stable
set search_path = ''
as $$
declare
  v_catch public.catches;
begin
  select * into v_catch from public.catches where id = p_id;
  if not found then
    raise exception 'catch_not_found' using errcode = 'P0002', detail = 'There is no such catch.';
  end if;
  return v_catch;
end;
$$;

create function public.director_review_catch(p_id uuid, p_status public.catch_status, p_note text default '')
returns public.catches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catch public.catches;
begin
  perform private.require_director();
  perform private.require_catch(p_id);
  update public.catches set status = p_status where id = p_id returning * into v_catch;
  update public.catch_evidence
     set reviewed_at = case when p_status = 'pending' then null else now() end,
         reviewed_by = case when p_status = 'pending' then null else auth.uid() end,
         review_note = left(coalesce(p_note, ''), 500)
   where catch_id = p_id;
  return v_catch;
end;
$$;

-- Correct what the angler filed: a misread board, the wrong species.
create function public.director_correct_catch(p_id uuid, p_species text, p_length_inches numeric)
returns public.catches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catch public.catches;
begin
  perform private.require_director();
  perform private.require_catch(p_id);
  update public.catches set species = btrim(p_species), length_inches = p_length_inches
   where id = p_id returning * into v_catch;
  return v_catch;
end;
$$;

-- Fish-I's look at the photo, or the reason it could not look.
create function public.director_set_ai_review(p_id uuid, p_review jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  perform private.require_catch(p_id);
  update public.catch_evidence set ai_review = p_review where catch_id = p_id;
end;
$$;

-- The boundary verdict worked out again against a corrected course.
create function public.director_set_catch_boundary(p_id uuid, p_boundary jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_director();
  perform private.require_catch(p_id);
  update public.catch_evidence set boundary = p_boundary where catch_id = p_id;
end;
$$;

-- ---- photos --------------------------------------------------------------------------
-- Private bucket. A photo can be added once, to a pending catch the device may
-- act for, at the path filing gave it - and never replaced, because there is
-- no update rule. Approved photos are the field's to see; the rest are the
-- angler's and the director's.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catch-photos', 'catch-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function private.can_add_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.catches c
    where c.photo_path = p_path and c.status = 'pending' and private.can_act_for(c.angler_id)
  )
$$;

create function private.can_see_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.catches c
    where c.photo_path = p_path and (c.status = 'approved' or private.can_act_for(c.angler_id))
  )
$$;

-- A withdrawn catch's photo goes with it: the angler's device may remove the
-- photo of its own pending catch (before withdrawing it), and the director may
-- remove any photo, including one left behind with no catch.
create function private.can_remove_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_director()
      or exists (
        select 1 from public.catches c
        where c.photo_path = p_path and c.status = 'pending' and private.can_act_for(c.angler_id)
      )
$$;

grant execute on function private.can_add_photo(text) to authenticated;
grant execute on function private.can_see_photo(text) to authenticated;
grant execute on function private.can_remove_photo(text) to authenticated;

create policy catch_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catch-photos' and private.can_add_photo(name));
create policy catch_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'catch-photos' and private.can_see_photo(name));
create policy catch_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catch-photos' and private.can_remove_photo(name));
