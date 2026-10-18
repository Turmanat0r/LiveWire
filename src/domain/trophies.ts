// The trophy case: personal bests, a line for every tournament fished, and the
// badges, worked out the way the old app works them out. tests/parity runs both
// on the same random careers.
//
// Everything on the screen comes from one pass over the record, so the numbers
// and the badges beneath them can never disagree about what somebody has done.
import {
  bigFishLeader,
  byLengthThenEarliest,
  compareIds,
  isScoringSpecies,
  standings,
} from './scoring';
import type { Angler, AnglerRole, Catch, DateKey, Division } from './types';
import { isValidTimeZone, zonedParts } from './time';

/** As much of a frozen result as the trophy case reads. */
export interface FrozenResult {
  readonly species: readonly string[];
  readonly divisions: Readonly<
    Record<Division, readonly { readonly anglerIds: readonly string[] }[]>
  >;
  readonly bigFish: { readonly anglerId: string } | null;
  readonly bets: readonly { readonly title: string; readonly winnerId: string | null }[];
}

/** One tournament, as far as the trophy case needs it. */
export interface TrophyEvent {
  readonly id: string;
  readonly name: string;
  /** The year of its last fishing day, "2027"; empty when it has no days. */
  readonly year: string;
  readonly timeZone: string;
  /** What scores there now. A frozen result's own list wins. */
  readonly species: readonly string[];
  readonly anglers: readonly Angler[];
  readonly catches: readonly Catch[];
  /** Settled side bets, while it is not frozen. An open one has no winner. */
  readonly bets: readonly { readonly title: string; readonly winnerId: string | null }[];
  readonly frozen: FrozenResult | null;
  /** Days one of your anglers here checked in and came back off the water. */
  readonly fullDays: readonly DateKey[];
}

export interface TrophyRow {
  readonly eventId: string;
  readonly name: string;
  readonly year: string;
  /** The handle carried that year: what the board called you at the time. */
  readonly handle: string;
  readonly frozen: boolean;
  readonly division: Division;
  /** Approved fish, any species. */
  readonly fish: number;
  /** Approved fish of a scoring species. */
  readonly scoring: number;
  readonly best: number;
  /** The fish behind `best`, so the all-time best can name its species. */
  readonly bestCatch: Catch | null;
  readonly top3: number;
  /** The most approved fish on one day, on the event's clock. */
  readonly bestDay: number;
  /** 1-based; 0 when not on the board. */
  readonly placing: number;
  /** Rows on the board in your division. */
  readonly entrants: number;
  readonly disqualified: boolean;
  /** Bought into the Big Fish pot. */
  readonly bigFish: boolean;
  readonly bigFishWon: boolean;
  /** The titles of side bets won, in order. */
  readonly betsWon: readonly string[];
  readonly fullDays: number;
  readonly species: readonly string[];
}

export interface TrophyStats {
  /** Most recent first. */
  readonly history: readonly TrophyRow[];
  readonly events: number;
  readonly fish: number;
  readonly species: readonly string[];
  readonly longest: Catch | null;
  readonly best: number;
  readonly bestTop3: number;
  readonly bestDay: number;
  readonly mostInEvent: number;
  readonly fullDays: number;
  readonly bigFishBuyIns: number;
  /** The lowest placing above zero; 0 when never ranked. */
  readonly bestPlacing: number;
  readonly wins: number;
  readonly podiums: number;
  readonly bigFishWins: number;
  readonly betsWon: number;
}

const ROLE_ORDER: Record<AnglerRole, number> = { solo: 0, captain: 0, partner: 1 };

/** A calendar day on the event's clock. A zone this phone has never heard of reads as UTC. */
function dayKeyIn(at: number, timeZone: string): DateKey {
  return zonedParts(at, isValidTimeZone(timeZone) ? timeZone : 'UTC').dateKey;
}

const sortedText = (values: Iterable<string>) =>
  [...new Set(values)].filter(Boolean).sort(compareIds);

/** Your line for one tournament, or null if none of your anglers fished it. */
export function trophyRow(event: TrophyEvent, mine: ReadonlySet<string>): TrophyRow | null {
  const meHere = event.anglers
    .filter((a) => mine.has(a.id))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || compareIds(a.id, b.id));
  const [entry] = meHere;
  if (!entry) return null;
  const { frozen } = event;
  // A frozen event is scored by the species it was frozen against, so the
  // fish counted on the row and the board it was placed on always agree.
  const species = frozen ? frozen.species : event.species;
  const approved = event.catches.filter((c) => c.status === 'approved' && mine.has(c.anglerId));
  const scoring = approved
    .filter((c) => isScoringSpecies(c.species, species))
    .sort(byLengthThenEarliest);
  const perDay = new Map<DateKey, number>();
  for (const c of approved) {
    const day = dayKeyIn(c.loggedAt, event.timeZone);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const { division } = entry;
  const table = frozen
    ? frozen.divisions[division]
    : standings(division, event.catches, event.anglers, species);
  const bigFish = frozen ? frozen.bigFish : bigFishLeader(event.catches, event.anglers, species);
  const [bestCatch] = scoring;
  return {
    eventId: event.id,
    name: event.name,
    year: event.year,
    handle: entry.handle,
    frozen: frozen !== null,
    division,
    fish: approved.length,
    scoring: scoring.length,
    best: bestCatch?.lengthInches ?? 0,
    bestCatch: bestCatch ?? null,
    top3: scoring.slice(0, 3).reduce((sum, c) => sum + c.lengthInches, 0),
    bestDay: Math.max(0, ...perDay.values()),
    placing: table.findIndex((row) => row.anglerIds.some((id) => mine.has(id))) + 1,
    entrants: table.length,
    disqualified: meHere.some((a) => a.disqualified),
    bigFish: meHere.some((a) => a.bigFish),
    bigFishWon: bigFish !== null && mine.has(bigFish.anglerId),
    betsWon: (frozen ? frozen.bets : event.bets)
      .filter((b) => b.winnerId !== null && mine.has(b.winnerId))
      .map((b) => b.title)
      .sort(compareIds),
    fullDays: new Set(event.fullDays).size,
    species: sortedText(approved.map((c) => c.species)),
  };
}

export function trophyStats(
  events: readonly TrophyEvent[],
  mine: ReadonlySet<string>,
): TrophyStats {
  const history = events
    .flatMap((e) => trophyRow(e, mine) ?? [])
    .sort((a, b) => compareIds(b.year, a.year) || compareIds(a.eventId, b.eventId));
  const mineAll = events.flatMap((e) =>
    e.catches.filter((c) => c.status === 'approved' && mine.has(c.anglerId)),
  );
  // The longest fish that SCORED, each measured against its own event's
  // species. A 40" pike in a walleye event is a fish caught, but calling it a
  // personal best would hand out the thirty-inch badge for a species nobody
  // was fishing for.
  const longest =
    history.flatMap((r) => (r.bestCatch ? [r.bestCatch] : [])).sort(byLengthThenEarliest)[0] ??
    null;
  const most = (pick: (r: TrophyRow) => number) => Math.max(0, ...history.map(pick));
  const count = (test: (r: TrophyRow) => boolean) => history.filter(test).length;
  const sum = (pick: (r: TrophyRow) => number) => history.reduce((t, r) => t + pick(r), 0);
  const placed = history.filter((r) => r.placing > 0).map((r) => r.placing);
  return {
    history,
    events: history.length,
    fish: mineAll.length,
    species: sortedText(mineAll.map((c) => c.species)),
    longest,
    best: longest?.lengthInches ?? 0,
    bestTop3: most((r) => r.top3),
    bestDay: most((r) => r.bestDay),
    mostInEvent: most((r) => r.fish),
    fullDays: sum((r) => r.fullDays),
    bigFishBuyIns: count((r) => r.bigFish),
    bestPlacing: placed.length > 0 ? Math.min(...placed) : 0,
    wins: count((r) => r.placing === 1),
    podiums: count((r) => r.placing >= 1 && r.placing <= 3),
    bigFishWins: count((r) => r.bigFishWon),
    betsWon: sum((r) => r.betsWon.length),
  };
}

export interface Badge {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  /** What it takes, shown on the tile until it is earned. */
  readonly need: string;
  readonly earned: (s: TrophyStats) => boolean;
}

/**
 * Every badge can be checked against the record: a badge nobody can explain
 * is worse than none, because the first thing an angler does is ask why
 * somebody else has it. Each reads the stats and nothing else, so a badge can
 * never claim something the trophy case is not also showing.
 */
// prettier-ignore
export const TROPHY_BADGES: readonly Badge[] = [
  { id: 'first-fish', name: 'First Fish', icon: '🐟', need: 'Land an approved fish', earned: (s) => s.fish >= 1 },
  { id: 'ten-fish', name: 'Ten Fish', icon: '🎣', need: 'Ten approved fish, all time', earned: (s) => s.fish >= 10 },
  { id: 'fifty-fish', name: 'Fifty Fish', icon: '⚓', need: 'Fifty approved fish, all time', earned: (s) => s.fish >= 50 },
  { id: 'twenty', name: 'Twenty-Incher', icon: '📏', need: 'A fish of 20 inches or better', earned: (s) => s.best >= 20 },
  { id: 'twentyfive', name: 'Twenty-Five Club', icon: '🥇', need: 'A fish of 25 inches or better', earned: (s) => s.best >= 25 },
  { id: 'thirty', name: 'Thirty-Inch Giant', icon: '🐉', need: 'A fish of 30 inches or better', earned: (s) => s.best >= 30 },
  { id: 'mixed-bag', name: 'Mixed Bag', icon: '🎨', need: 'Two or more species logged', earned: (s) => s.species.length >= 2 },
  { id: 'hot-day', name: 'Hot Hand', icon: '🔥', need: 'Five approved fish in one day', earned: (s) => s.bestDay >= 5 },
  { id: 'full-days', name: 'Full Day', icon: '🌅', need: 'Check in and back out on the same day', earned: (s) => s.fullDays >= 1 },
  { id: 'pot', name: 'In The Pot', icon: '🎲', need: 'Buy into the Big Fish pot', earned: (s) => s.bigFishBuyIns >= 1 },
  { id: 'podium', name: 'Podium', icon: '🎖', need: 'Finish in the top three', earned: (s) => s.podiums >= 1 },
  { id: 'champion', name: 'Champion', icon: '🏆', need: 'Win your division', earned: (s) => s.wins >= 1 },
  { id: 'veteran', name: 'Veteran', icon: '🧭', need: 'Fish two or more tournaments', earned: (s) => s.events >= 2 },
  { id: 'big-fish', name: 'Big Fish', icon: '🏅', need: 'Take the Big Fish pot', earned: (s) => s.bigFishWins >= 1 },
  { id: 'side-bet', name: 'Side Bet', icon: '🤝', need: 'Win a side bet', earned: (s) => s.betsWon >= 1 },
];

export interface EarnedBadge {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly need: string;
  readonly earned: boolean;
}

export function trophyBadges(stats: TrophyStats): EarnedBadge[] {
  return TROPHY_BADGES.map(({ earned, ...b }) => ({ ...b, earned: earned(stats) }));
}
