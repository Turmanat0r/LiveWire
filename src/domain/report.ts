// Montana Fish, Wildlife & Parks wants a fishing contest report within 30
// days of the last day fished. Everything on that form the tournament itself
// recorded is worked out here from the roster, the check-ins and the catch
// log: ported from the old app, and proved against it in tests/parity.
//
// The rule this follows: never guess a number that goes to the state. Where
// the app cannot know something it says so, and where a count had to leave
// records out, a warning says which.
import { byLengthThenEarliest, isScoringSpecies } from './scoring';
import type { CheckIn } from './safety';
import { zonedParts } from './time';
import type { AnglerRole, Catch, DateKey, Division, EpochMs } from './types';

export const FWP_DEADLINE_DAYS = 30;

/** An angler as the report sees them. */
export interface ReportAngler {
  readonly id: string;
  readonly division: Division;
  readonly role: AnglerRole;
  readonly feePaid: boolean;
  readonly disqualified: boolean;
  /** Asked at registration; null for anyone who entered before it was. */
  readonly resident: boolean | null;
}

/**
 * The head of the form. Everyone on the roster fished, whatever state their
 * fee is in: the state is counting people, and "# Paid" is the one box that is
 * about money. A team is one entry and two anglers, and the form asks for both.
 */
export function fieldCounts(anglers: readonly ReportAngler[]) {
  const paid = anglers.filter((a) => a.feePaid).length;
  return {
    anglers: anglers.length,
    teams: anglers.filter((a) => a.division === 'team' && a.role !== 'partner').length,
    paid,
    unpaid: anglers.length - paid,
  };
}

/**
 * Residents and non-residents. Anyone who entered before the question was
 * asked is counted apart rather than guessed at.
 */
export function residencyCounts(anglers: readonly ReportAngler[]) {
  const out = { resident: 0, nonresident: 0, unknown: 0, unknownIds: [] as string[] };
  for (const a of anglers) {
    if (a.resident === true) out.resident += 1;
    else if (a.resident === false) out.nonresident += 1;
    else {
      out.unknown += 1;
      out.unknownIds.push(a.id);
    }
  }
  return out;
}

/**
 * Rejected catches are left out everywhere: the usual reason is the same fish
 * photographed twice. Pending ones count, and a warning says how many.
 */
export function reportable(catches: readonly Catch[]): Catch[] {
  return catches.filter((c) => c.status !== 'rejected');
}

export interface DayHours {
  /** 1 for the first fishing day. */
  readonly day: number;
  readonly dateKey: DateKey;
  readonly start: EpochMs | null;
  readonly stop: EpochMs | null;
  readonly hours: number | null;
}

/** Hours fished each day: the first line in to the last boat off. */
export function dayHours(checkIns: readonly CheckIn[], dates: readonly DateKey[]): DayHours[] {
  return dates.map((dateKey, i) => {
    let start: EpochMs | null = null;
    let stop: EpochMs | null = null;
    for (const c of checkIns) {
      if (c.date !== dateKey) continue;
      if (c.inAt && (start === null || c.inAt < start)) start = c.inAt;
      if (c.outAt && (stop === null || c.outAt > stop)) stop = c.outAt;
    }
    const hours =
      start !== null && stop !== null && stop > start ? (stop - start) / 3_600_000 : null;
    return { day: i + 1, dateKey, start, stop, hours };
  });
}

/**
 * Fish per day, on the event's clock, plus any landed outside the event's
 * dates. Those are almost always test entries, and a total that does not add
 * up should show rather than be tidied away.
 */
export function catchesPerDay(
  catches: readonly Catch[],
  dates: readonly DateKey[],
  timeZone: string,
): { counts: Readonly<Record<DateKey, number>>; offDays: number } {
  const counts: Record<DateKey, number> = {};
  for (const d of dates) counts[d] = 0;
  let offDays = 0;
  for (const c of reportable(catches)) {
    const key = zonedParts(c.loggedAt, timeZone).dateKey;
    const n = counts[key];
    if (n === undefined) offDays += 1;
    else counts[key] = n + 1;
  }
  return { counts, offDays };
}

export interface SpeciesRow {
  readonly species: string;
  readonly caught: number;
  readonly longest: number;
  readonly died: number;
  readonly released: number;
}

/**
 * Number of fish caught, one row per species, most first. How many died is
 * the director's number: this is catch-photo-release, so the app records no
 * fish that did not swim away, and zero is the honest default. More deaths
 * than fish is a typo, and is held to the number caught.
 */
export function speciesTally(
  catches: readonly Catch[],
  died: Readonly<Record<string, number>> = {},
): SpeciesRow[] {
  const rows = new Map<string, { species: string; caught: number; longest: number }>();
  for (const c of reportable(catches)) {
    const name = c.species || 'Unknown';
    const row = rows.get(name) ?? { species: name, caught: 0, longest: 0 };
    row.caught += 1;
    if (c.lengthInches > row.longest) row.longest = c.lengthInches;
    rows.set(name, row);
  }
  return [...rows.values()]
    .map((row) => {
      const d = Math.max(0, Math.min(row.caught, Math.floor(Number(died[row.species]) || 0)));
      return { ...row, died: d, released: row.caught - d };
    })
    .sort((a, b) => b.caught - a.caught || a.species.localeCompare(b.species));
}

export const SIZE_SMALL_MIN = 8;
export const SIZE_SMALL_MAX = 23;
export const SIZE_LARGE_MIN = 12;
/** The last column is "30+", so anything longer folds into it. */
export const SIZE_LARGE_MAX = 30;

export interface SizeRow {
  readonly species: string;
  /** Fish per whole inch, by the column they go in. */
  readonly counts: Readonly<Record<number, number>>;
  /** The species had fish only one table could hold and fish only the other could. */
  readonly split: boolean;
}

/**
 * Page two's size distribution: one table with columns 8 to 23, one with 12 to
 * 30+. Taken literally, a 15″ walleye belongs in both, which would report it
 * twice, so each species goes in whichever one table has columns for the whole
 * of its range, and is split across both only when neither does.
 */
export function sizeDistribution(catches: readonly Catch[]): {
  small: SizeRow[];
  large: SizeRow[];
  under8: number;
} {
  const byName = new Map<string, number[]>();
  let under8 = 0;
  for (const c of reportable(catches)) {
    if (!(c.lengthInches > 0)) continue;
    // Down to the whole inch: a 12.75″ fish is a fish in the 12 column.
    const inch = Math.floor(c.lengthInches);
    if (inch < SIZE_SMALL_MIN) {
      under8 += 1;
      continue;
    }
    const name = c.species || 'Unknown';
    byName.set(name, [...(byName.get(name) ?? []), inch]);
  }
  const tally = (list: readonly number[], max: number) => {
    const out: Record<number, number> = {};
    for (const i of list) {
      const col = Math.min(i, max);
      out[col] = (out[col] ?? 0) + 1;
    }
    return out;
  };
  const small: SizeRow[] = [];
  const large: SizeRow[] = [];
  for (const name of [...byName.keys()].sort()) {
    const inches = byName.get(name) ?? [];
    const needsSmall = Math.min(...inches) < SIZE_LARGE_MIN;
    const needsLarge = Math.max(...inches) > SIZE_SMALL_MAX;
    if (needsSmall && needsLarge) {
      small.push({
        species: name,
        counts: tally(
          inches.filter((i) => i < SIZE_LARGE_MIN),
          SIZE_SMALL_MAX,
        ),
        split: true,
      });
      large.push({
        species: name,
        counts: tally(
          inches.filter((i) => i >= SIZE_LARGE_MIN),
          SIZE_LARGE_MAX,
        ),
        split: true,
      });
    } else if (needsSmall) {
      small.push({ species: name, counts: tally(inches, SIZE_SMALL_MAX), split: false });
    } else {
      large.push({ species: name, counts: tally(inches, SIZE_LARGE_MAX), split: false });
    }
  }
  return { small, large, under8 };
}

/**
 * The size of the winning fish, by the same test the standings use, ties to
 * the fish landed first, so the form and the trophy never name different fish.
 */
export function winningFish(
  catches: readonly Catch[],
  anglers: readonly ReportAngler[],
  scoringSpecies: readonly string[],
): Catch | null {
  const dq = new Set(anglers.filter((a) => a.disqualified).map((a) => a.id));
  return (
    catches
      .filter(
        (c) =>
          c.status === 'approved' &&
          isScoringSpecies(c.species, scoringSpecies) &&
          !dq.has(c.anglerId),
      )
      .sort(byLengthThenEarliest)[0] ?? null
  );
}

/** Thirty days from the last day fished, and how many days are left. */
export function reportDue(
  dates: readonly DateKey[],
  now: EpochMs,
): { readonly due: EpochMs; readonly daysLeft: number } | null {
  const last = dates.at(-1);
  if (last === undefined) return null;
  const at = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  const due = at + FWP_DEADLINE_DAYS * 86_400_000;
  return { due, daysLeft: Math.ceil((due - now) / 86_400_000) };
}

export type ReportWarning =
  /** Entries with no fee matched: the "# Paid" box reads low. */
  | { readonly kind: 'unpaid'; readonly count: number }
  /** Anglers never asked about residency. */
  | { readonly kind: 'residency'; readonly count: number }
  /** Catches still waiting on review, counted as caught. */
  | { readonly kind: 'pending'; readonly count: number }
  /** Catches outside the event's dates: in the totals, on no day row. */
  | { readonly kind: 'off-days'; readonly count: number };

/** Everything the report cannot vouch for, in the order the old app said it. */
export function reportWarnings(
  anglers: readonly ReportAngler[],
  catches: readonly Catch[],
  dates: readonly DateKey[],
  timeZone: string,
): ReportWarning[] {
  const out: ReportWarning[] = [];
  const unpaid = fieldCounts(anglers).unpaid;
  if (unpaid > 0) out.push({ kind: 'unpaid', count: unpaid });
  const unknown = residencyCounts(anglers).unknown;
  if (unknown > 0) out.push({ kind: 'residency', count: unknown });
  const pending = catches.filter((c) => c.status === 'pending').length;
  if (pending > 0) out.push({ kind: 'pending', count: pending });
  const off = catchesPerDay(catches, dates, timeZone).offDays;
  if (off > 0) out.push({ kind: 'off-days', count: off });
  return out;
}

/** "07:15" on the event's clock: what a time box reads and writes. */
export function clockText(at: EpochMs | null, timeZone: string): string {
  if (!at) return '';
  return new Date(at).toLocaleTimeString('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

export function clockToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

export interface DayRow {
  readonly day: number;
  readonly dateKey: DateKey;
  readonly start: string;
  readonly stop: string;
  /** The director typed a time over the check-ins'. */
  readonly overridden: boolean;
  readonly hours: number | null;
}

/**
 * One day's hours: a time the director typed beats the check-ins', and the
 * total always comes from whichever pair is in force, so a corrected stop time
 * never sits next to a stale total.
 */
export function dayRow(
  day: DayHours,
  saved: { readonly start?: string; readonly stop?: string } | undefined,
  timeZone: string,
): DayRow {
  // An empty box is no override: it falls back to the check-ins' time.
  const typedStart = saved?.start ?? '';
  const typedStop = saved?.stop ?? '';
  const start = typedStart !== '' ? typedStart : clockText(day.start, timeZone);
  const stop = typedStop !== '' ? typedStop : clockText(day.stop, timeZone);
  const from = clockToMinutes(start);
  const to = clockToMinutes(stop);
  return {
    day: day.day,
    dateKey: day.dateKey,
    start,
    stop,
    overridden: typedStart !== '' || typedStop !== '',
    hours: from !== null && to !== null && to > from ? (to - from) / 60 : null,
  };
}
