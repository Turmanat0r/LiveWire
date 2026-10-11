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

export const DEVICE = 'device-1';

/** A whole entry as the server holds it: the entry, its anglers, their private rows, and this phone's link. */
export function entryRows(
  over: {
    entryId?: string;
    number?: number;
    team?: boolean;
    userId?: string | null;
    feePaid?: boolean;
    names?: readonly [string, string?];
  } = {},
) {
  const entryId = over.entryId ?? crypto.randomUUID();
  const team = over.team ?? false;
  const [first = 'Daniel Turman', second = 'Pat Partner'] = over.names ?? [];
  const captainId = `${entryId}-a`;
  const partnerId = `${entryId}-b`;
  const entry: Row<'entries'> = {
    id: entryId,
    event_id: EVENT_ID,
    entry_number: over.number ?? 1,
    division: team ? 'team' : 'solo',
    created_at: '2027-01-01T00:00:00+00:00',
  };
  const entryPrivate: Row<'entry_private'> = {
    entry_id: entryId,
    event_id: EVENT_ID,
    team_code: team ? 'TQ7M' : null,
    fee_paid: over.feePaid ?? false,
    fee_paid_at: null,
  };
  const angler = (id: string, role: Row<'anglers'>['role'], handle: string): Row<'anglers'> => ({
    id,
    entry_id: entryId,
    event_id: EVENT_ID,
    role,
    handle,
    big_fish: true,
    disqualified: false,
    registered_at: '2027-01-01T00:00:00+00:00',
  });
  const details = (id: string, name: string, code: string): Row<'angler_private'> => ({
    angler_id: id,
    event_id: EVENT_ID,
    person_id: null,
    full_name: name,
    phone: '406-555-0100',
    emergency_name: 'Shore Contact',
    emergency_phone: '406-555-0199',
    resident: true,
    angler_code: code,
    dq_reason: '',
    disqualified_at: null,
  });
  const anglers = [angler(captainId, team ? 'captain' : 'solo', 'Salty Bedrock Perch')];
  const privates = [details(captainId, first, '7K4M')];
  if (team) {
    anglers.push(angler(partnerId, 'partner', 'Soggy Granite Walleye'));
    privates.push(details(partnerId, second, '9HCX'));
  }
  const devices: Row<'entry_devices'>[] =
    over.userId === null
      ? []
      : [
          {
            entry_id: entryId,
            event_id: EVENT_ID,
            user_id: over.userId ?? DEVICE,
            angler_id: captainId,
            added_at: '2027-01-01T00:00:00+00:00',
          },
        ];
  return { entry, entryPrivate, anglers, privates, devices, captainId, partnerId };
}
