-- The server's clock, so a phone can tell how far its own has drifted.
--
-- Every catch photo has its time burned into the pixels, and the stamp says
-- when the phone's clock was more than two minutes out, or could not be
-- checked. The old app read the server's time from a response header, which
-- browsers hide from cross-site requests; asking the database is exact.

create function public.server_now()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now()
$$;

revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
