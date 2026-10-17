-- The course boundary on its own, from the director's boundary editor. The
-- column's own check refuses a shape no phone could judge against.

create function public.director_set_course(p_event_id uuid, p_course jsonb)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_director();
  if not private.is_valid_course(p_course) then
    raise exception 'invalid_course' using errcode = '22023',
      detail = 'A circle needs a centre and a radius; an outline needs three or more real corners.';
  end if;
  update public.events set course = p_course where id = p_event_id
    returning * into v_event;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002', detail = 'There is no such event.';
  end if;
  return v_event;
end;
$$;

revoke execute on function public.director_set_course(uuid, jsonb) from public, anon;
grant execute on function public.director_set_course(uuid, jsonb) to authenticated;
