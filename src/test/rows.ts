// Server rows for tests, complete, with only what a test cares about given.
import type { Row } from '../data/tables';

export const EVENT_ID = '00000000-0000-4000-8000-000000000001';
export const OTHER_EVENT_ID = '00000000-0000-4000-8000-000000000002';

export function eventRow(over: Partial<Row<'events'>> = {}): Row<'events'> {
  return {
    id: EVENT_ID,
    name: 'Montana Kayak Walleye Open',
    presenter: 'Big Sky Kayak Anglers',
    entry_prefix: 'MKWO',
    time_zone: 'America/Denver',
    registration_closes_at: '2027-09-17T06:00:00+00:00',
    lines_in: '07:00:00',
    lines_out: '14:00:00',
    final_check_in: '15:00:00',
    course: { kind: 'none' },
    course_label: '',
    course_label_long: '',
    fee_solo_cents: 3000,
    fee_team_cents: 5000,
    fee_big_fish_cents: 1000,
    payout_basis_points: [5000, 3000, 2000],
    awards_budget_cents: 0,
    is_current: true,
    archived: false,
    created_at: '2027-01-01T00:00:00+00:00',
    updated_at: '2027-01-01T00:00:00+00:00',
    ...over,
  };
}

export function dayRow(day: string, eventId = EVENT_ID): Row<'event_days'> {
  return { event_id: eventId, day };
}

export function catchRow(over: Partial<Row<'catches'>> = {}): Row<'catches'> {
  const id = over.id ?? crypto.randomUUID();
  return {
    id,
    event_id: EVENT_ID,
    angler_id: 'angler-1',
    division: 'solo',
    species: 'Walleye',
    length_inches: 21.5,
    logged_at: '2027-09-18T15:00:00+00:00',
    received_at: '2027-09-18T15:00:01+00:00',
    status: 'approved',
    photo_path: `${EVENT_ID}/${id}.jpg`,
    updated_at: '2027-09-18T15:00:01+00:00',
    ...over,
  };
}

export function checkInRow(over: Partial<Row<'check_ins'>> = {}): Row<'check_ins'> {
  return {
    angler_id: 'angler-1',
    day: '2027-09-18',
    event_id: EVENT_ID,
    in_at: '2027-09-18T12:30:00+00:00',
    out_at: null,
    updated_at: '2027-09-18T12:30:00+00:00',
    updated_by: null,
    ...over,
  };
}
