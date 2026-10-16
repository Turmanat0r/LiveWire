-- The director's awards budget on its own. Setting it from the payout
-- calculator should not mean sending the whole event back, which could undo
-- an edit made to the event in the meantime.

create function public.director_set_awards_budget(p_event_id uuid, p_cents integer)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_director();
  if p_cents is null or p_cents < 0 then
    raise exception 'invalid_amount' using errcode = '22023',
      detail = 'An awards budget is zero or more.';
  end if;
  update public.events set awards_budget_cents = p_cents where id = p_event_id
    returning * into v_event;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002', detail = 'There is no such event.';
  end if;
  return v_event;
end;
$$;

revoke execute on function public.director_set_awards_budget(uuid, integer) from public, anon;
grant execute on function public.director_set_awards_budget(uuid, integer) to authenticated;
