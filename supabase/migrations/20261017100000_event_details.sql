-- Saving an event's details leaves its course and its awards budget as they
-- are unless they are given. Each has its own tool, and a details form sent
-- from a copy that has not caught up must not put back an old boundary or an
-- old budget. A new event with neither starts with no course and no budget.

create or replace function public.director_save_event(
  p_id uuid,
  p_name text,
  p_entry_prefix text,
  p_time_zone text,
  p_registration_closes_at timestamptz,
  p_days date[],
  p_presenter text default '',
  p_lines_in time default '07:00',
  p_lines_out time default '14:00',
  p_final_check_in time default '15:00',
  p_course jsonb default null,
  p_course_label text default '',
  p_course_label_long text default '',
  p_fee_solo_cents integer default 3000,
  p_fee_team_cents integer default 5000,
  p_fee_big_fish_cents integer default 1000,
  p_payout_basis_points integer[] default '{5000,3000,2000}',
  p_awards_budget_cents integer default null
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  perform private.require_director();
  if cardinality(p_days) not between 1 and 7 then
    raise exception 'invalid_days' using errcode = '22023',
      detail = 'An event runs for one to seven days.';
  end if;

  insert into public.events as e (
    id, name, presenter, entry_prefix, time_zone, registration_closes_at,
    lines_in, lines_out, final_check_in, course, course_label, course_label_long,
    fee_solo_cents, fee_team_cents, fee_big_fish_cents, payout_basis_points, awards_budget_cents
  ) values (
    p_id, btrim(p_name), p_presenter, upper(btrim(p_entry_prefix)), p_time_zone, p_registration_closes_at,
    p_lines_in, p_lines_out, p_final_check_in, coalesce(p_course, '{"kind": "none"}'),
    p_course_label, p_course_label_long,
    p_fee_solo_cents, p_fee_team_cents, p_fee_big_fish_cents, p_payout_basis_points,
    coalesce(p_awards_budget_cents, 0)
  )
  on conflict (id) do update set
    name = excluded.name, presenter = excluded.presenter, entry_prefix = excluded.entry_prefix,
    time_zone = excluded.time_zone, registration_closes_at = excluded.registration_closes_at,
    lines_in = excluded.lines_in, lines_out = excluded.lines_out, final_check_in = excluded.final_check_in,
    course = coalesce(p_course, e.course),
    course_label = excluded.course_label, course_label_long = excluded.course_label_long,
    fee_solo_cents = excluded.fee_solo_cents, fee_team_cents = excluded.fee_team_cents,
    fee_big_fish_cents = excluded.fee_big_fish_cents, payout_basis_points = excluded.payout_basis_points,
    awards_budget_cents = coalesce(p_awards_budget_cents, e.awards_budget_cents)
  returning * into v_event;

  -- Days that have check-ins cannot be dropped: the foreign key refuses, and
  -- the director is told which day is in use.
  begin
    delete from public.event_days where event_id = p_id and day <> all (p_days);
  exception when foreign_key_violation then
    raise exception 'day_in_use' using errcode = '23503',
      detail = 'A day you removed already has check-ins on it.';
  end;
  insert into public.event_days (event_id, day)
    select p_id, d from unnest(p_days) d
    on conflict do nothing;

  return v_event;
end;
$$;
