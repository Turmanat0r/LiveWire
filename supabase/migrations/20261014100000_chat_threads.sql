-- A deleted message takes its replies with it, as it did in the old app.
-- Left behind, a reply turns into a post of its own that answers nothing.

alter table public.messages
  drop constraint messages_reply_to_fkey,
  add constraint messages_reply_to_fkey
    foreign key (reply_to) references public.messages (id) on delete cascade;

-- One level deep, as the app shows it: a reply to a reply is a reply to the post.
create or replace function public.post_message(
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
  v_parent public.messages;
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
  if p_reply_to is not null then
    select * into v_parent from public.messages where id = p_reply_to;
    if not found or v_parent.event_id <> v_angler.event_id then
      raise exception 'message_not_found' using errcode = 'P0002',
        detail = 'The message you replied to has been deleted.';
    end if;
  end if;
  insert into public.messages (id, event_id, angler_id, handle, kind, body, reply_to, catch_id)
    values (p_id, v_angler.event_id, p_angler_id, v_angler.handle,
            case when p_catch_id is null then 'chat' else 'catch' end::public.message_kind,
            btrim(coalesce(p_body, '')), coalesce(v_parent.reply_to, v_parent.id), p_catch_id)
  returning * into v_message;
  return v_message;
end;
$$;
