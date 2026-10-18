-- The trophy case: which anglers are you, in every tournament, and which days
-- each of them checked in and came back off the water.
--
-- You are every angler on an entry this device holds, and every angler who
-- registered with the same phone number as one of them: the old app's join,
-- and the one claiming an entry already treats as proof. The phone gets ids;
-- the numbers that join them never leave the database.
--
-- Check-in times stay private. The "Full Day" badge needs to know only which
-- days were finished, so that is all this hands back, even for an entry made
-- on another phone, whose check-ins this device cannot read.

create function public.my_trophy_anglers()
returns table (angler_id uuid, event_id uuid, full_days date[])
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select a.id
    from public.entry_devices d
    join public.anglers a on a.entry_id = d.entry_id
    where d.user_id = auth.uid()
  ),
  everyone as (
    select id from mine
    union
    select other.angler_id
    from mine
    join public.angler_private mp on mp.angler_id = mine.id
    join public.angler_private other on other.person_id = mp.person_id
    where mp.person_id is not null
  )
  select a.id, a.event_id,
    coalesce(array_agg(c.day order by c.day) filter (where c.day is not null), '{}')
  from everyone e
  join public.anglers a on a.id = e.id
  left join public.check_ins c
    on c.angler_id = a.id and c.in_at is not null and c.out_at is not null
  group by a.id, a.event_id
$$;

revoke execute on function public.my_trophy_anglers() from public, anon;
grant execute on function public.my_trophy_anglers() to authenticated;
