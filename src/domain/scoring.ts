import type { Angler, Catch, Division, EpochMs } from './types';
import { OTHER_SPECIES } from './types';

/** Code-unit order, so every phone sorts the same way whatever its language. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Tie rule, set by the director: every ranking breaks a tie on the earliest
 * fish, then on the id. Arrival order never decides anything, because the order
 * rows come back from the server changes whenever one of them is updated.
 */
export function byEarliest(a: Catch, b: Catch): number {
  return a.loggedAt - b.loggedAt || compareIds(a.id, b.id);
}

/** Longest first, then earliest. Big Fish and the winning fish on the state report. */
export function byLengthThenEarliest(a: Catch, b: Catch): number {
  return b.lengthInches - a.lengthInches || byEarliest(a, b);
}

/** Shortest first, then earliest. The "smallest fish" side bet. */
export function bySmallestThenEarliest(a: Catch, b: Catch): number {
  return a.lengthInches - b.lengthInches || byEarliest(a, b);
}

export function isScoringSpecies(species: string, scoringSpecies: readonly string[]): boolean {
  return species !== OTHER_SPECIES && scoringSpecies.includes(species);
}

/** Approved, a scoring species, and not filed by a disqualified angler. */
export function countsTowardStandings(
  c: Catch,
  scoringSpecies: readonly string[],
  anglersById: ReadonlyMap<string, Angler>,
): boolean {
  if (c.status !== 'approved' || !isScoringSpecies(c.species, scoringSpecies)) return false;
  return anglersById.get(c.anglerId)?.disqualified !== true;
}

export interface StandingsRow {
  /** The team id for a team, the angler id for a solo entry. */
  readonly key: string;
  /** Everyone whose fish counted toward this row, sorted by id. */
  readonly anglerIds: readonly string[];
  readonly bestInches: number;
  readonly bestAt: EpochMs;
  readonly top3Inches: number;
  readonly fishCount: number;
}

export function indexAnglers(anglers: readonly Angler[]): Map<string, Angler> {
  return new Map(anglers.map((a) => [a.id, a]));
}

/**
 * One division's standings: the single longest fish, then the best three
 * combined, then whoever caught their best fish first.
 *
 * A team ranks as one unit, so either partner's fish lands in the same row. A
 * disqualified angler's fish are left out; their teammate's still count.
 */
export function standings(
  division: Division,
  catches: readonly Catch[],
  anglers: readonly Angler[],
  scoringSpecies: readonly string[],
): StandingsRow[] {
  const anglersById = indexAnglers(anglers);
  const groups = new Map<string, { fish: Catch[]; anglerIds: Set<string> }>();

  for (const c of catches) {
    if (c.division !== division || !countsTowardStandings(c, scoringSpecies, anglersById)) continue;
    const teamId = anglersById.get(c.anglerId)?.teamId;
    const key = division === 'team' && teamId ? teamId : c.anglerId;
    let group = groups.get(key);
    if (!group) {
      group = { fish: [], anglerIds: new Set() };
      groups.set(key, group);
    }
    group.fish.push(c);
    group.anglerIds.add(c.anglerId);
  }

  const rows: StandingsRow[] = [];
  for (const [key, group] of groups) {
    const sorted = group.fish.sort(byLengthThenEarliest);
    const [best] = sorted;
    if (!best) continue;
    rows.push({
      key,
      anglerIds: [...group.anglerIds].sort(compareIds),
      bestInches: best.lengthInches,
      bestAt: best.loggedAt,
      top3Inches: sorted.slice(0, 3).reduce((sum, c) => sum + c.lengthInches, 0),
      fishCount: sorted.length,
    });
  }

  return rows.sort(
    (a, b) =>
      b.bestInches - a.bestInches ||
      b.top3Inches - a.top3Inches ||
      a.bestAt - b.bestAt ||
      compareIds(a.key, b.key),
  );
}

/** 1-based placing for one angler in their division, or 0 when not ranked. */
export function rankOf(
  angler: Angler,
  catches: readonly Catch[],
  anglers: readonly Angler[],
  scoringSpecies: readonly string[],
): number {
  const table = standings(angler.division, catches, anglers, scoringSpecies);
  return table.findIndex((row) => row.anglerIds.includes(angler.id)) + 1;
}

/** Bought into the Big Fish pot and still eligible. */
export function bigFishEntrants(anglers: readonly Angler[]): Angler[] {
  return anglers.filter((a) => a.bigFish && !a.disqualified);
}

/** The Big Fish board: entrants' approved scoring fish, longest then earliest. */
export function bigFishBoard(
  catches: readonly Catch[],
  anglers: readonly Angler[],
  scoringSpecies: readonly string[],
): Catch[] {
  const inPot = new Set(bigFishEntrants(anglers).map((a) => a.id));
  return catches
    .filter(
      (c) =>
        c.status === 'approved' &&
        isScoringSpecies(c.species, scoringSpecies) &&
        inPot.has(c.anglerId),
    )
    .sort(byLengthThenEarliest);
}

export function bigFishLeader(
  catches: readonly Catch[],
  anglers: readonly Angler[],
  scoringSpecies: readonly string[],
): Catch | null {
  return bigFishBoard(catches, anglers, scoringSpecies)[0] ?? null;
}
