// A tournament to test against: an event the director has set up, and
// registration forms filled in the way the app fills them in.
import { randomUUID } from 'node:crypto';
import { rowOf, type Caller, type TestDb } from './harness';

export const DAY_1 = '2027-09-18';
export const DAY_2 = '2027-09-19';

export interface EventSetup {
  readonly director: Caller;
  readonly eventId: string;
}

export async function setUpEvent(
  db: TestDb,
  opts: { closesInDays?: number; current?: boolean; director?: Caller } = {},
): Promise<EventSetup> {
  const director = opts.director ?? (await db.director());
  const eventId = randomUUID();
  const closes = new Date(Date.now() + (opts.closesInDays ?? 30) * 86_400_000).toISOString();
  rowOf(
    await db.call(director, 'director_save_event', {
      p_id: eventId,
      p_name: 'Montana Kayak Walleye Open',
      p_entry_prefix: 'MKWO',
      p_time_zone: 'America/Denver',
      p_registration_closes_at: closes,
      p_days: [DAY_1, DAY_2],
      p_course: { kind: 'circle', center: { lat: 46.38917, lng: -111.57556 }, radiusMiles: 4 },
    }),
  );
  rowOf(
    await db.call(director, 'director_set_event_species', {
      p_event_id: eventId,
      p_species: JSON.stringify([{ name: 'Walleye', recordInches: 36 }, { name: 'Pike' }]),
    }),
  );
  if (opts.current ?? true)
    rowOf(await db.call(director, 'director_set_current_event', { p_event_id: eventId }));
  return { director, eventId };
}

// Each test file starts somewhere random in a ten-million-number range and
// counts up, so numbers never repeat within a file and almost never across
// files sharing one database.
let nextPhone = Math.floor(Math.random() * 9_000_000);
/** A phone number nobody else in the test run has. */
export function newPhone(): string {
  nextPhone += 1;
  const tail = String(nextPhone % 10_000_000).padStart(7, '0');
  return `406-${tail.slice(0, 3)}-${tail.slice(3)}`;
}

export interface Registrant {
  id: string;
  fullName: string;
  phone: string;
  handle: string;
  bigFish: boolean;
  resident: boolean;
  emergencyName: string;
  emergencyPhone: string;
}

let nameCounter = 0;
export function registrant(over: Partial<Registrant> = {}): Registrant {
  nameCounter += 1;
  return {
    id: randomUUID(),
    fullName: `Angler ${nameCounter} ${randomUUID().slice(0, 6)}`,
    phone: newPhone(),
    handle: `Salty Bedrock Perch ${nameCounter} ${randomUUID().slice(0, 4)}`,
    bigFish: false,
    resident: true,
    emergencyName: 'Shore Contact',
    emergencyPhone: newPhone(),
    ...over,
  };
}

export interface EntrySummary {
  entryId: string;
  eventId: string;
  entryNumber: number;
  division: 'solo' | 'team';
  teamCode: string | null;
  feePaid: boolean;
  anglerId?: string;
  anglers: {
    id: string;
    role: string;
    handle: string;
    anglerCode: string;
    fullName: string;
    bigFish: boolean;
  }[];
}

export async function registerSolo(
  db: TestDb,
  device: Caller,
  eventId: string,
  over: Partial<Registrant> = {},
): Promise<{ summary: EntrySummary; angler: Registrant }> {
  const angler = registrant(over);
  const result = await db.call<{ register_entry: EntrySummary }>(device, 'register_entry', {
    p_entry_id: randomUUID(),
    p_event_id: eventId,
    p_division: 'solo',
    p_captain: angler,
  });
  return { summary: rowOf(result).register_entry, angler };
}

export async function registerTeam(
  db: TestDb,
  device: Caller,
  eventId: string,
): Promise<{ summary: EntrySummary; captain: Registrant; partner: Registrant }> {
  const captain = registrant();
  const partner = registrant({ emergencyName: '', emergencyPhone: '' });
  const result = await db.call<{ register_entry: EntrySummary }>(device, 'register_entry', {
    p_entry_id: randomUUID(),
    p_event_id: eventId,
    p_division: 'team',
    p_captain: captain,
    p_partner: partner,
  });
  return { summary: rowOf(result).register_entry, captain, partner };
}

export function codeOf(summary: EntrySummary, anglerId: string): string {
  const found = summary.anglers.find((a) => a.id === anglerId);
  if (!found) throw new Error(`No angler ${anglerId} on entry`);
  return found.anglerCode;
}
