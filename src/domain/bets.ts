import type { Angler, Catch, EpochMs } from './types';
import { byEarliest, bySmallestThenEarliest, isScoringSpecies } from './scoring';

// Side bets anglers run among themselves. The app keeps score, never money.
// "manual" is for anything the app cannot see; whoever started it calls it.

export type BetScoring = 'smallest' | 'most' | 'first' | 'manual';

export interface Bet {
  readonly id: string;
  readonly title: string;
  readonly stake: string;
  readonly scoring: BetScoring;
  readonly creatorId: string;
  /** Set once somebody has called it. */
  readonly winnerId: string | null;
}

export type BetLeader =
  | {
      readonly scoring: 'most';
      readonly anglerId: string;
      readonly fishCount: number;
      /** True when others had the same count and this angler reached it first. */
      readonly gotThereFirst: boolean;
    }
  | { readonly scoring: 'first'; readonly anglerId: string; readonly at: EpochMs }
  | { readonly scoring: 'smallest'; readonly anglerId: string; readonly lengthInches: number };

/**
 * Who is leading a bet, from approved fish of the scoring species. Null when it
 * cannot be called yet, which is not the same thing as a draw.
 */
export function betLeader(
  bet: Bet,
  entrantIds: readonly string[],
  catches: readonly Catch[],
  anglersById: ReadonlyMap<string, Angler>,
  scoringSpecies: readonly string[],
): BetLeader | null {
  if (bet.scoring === 'manual' || entrantIds.length === 0) return null;
  const entrants = new Set(entrantIds);
  const eligible = catches.filter(
    (c) =>
      c.status === 'approved' &&
      isScoringSpecies(c.species, scoringSpecies) &&
      entrants.has(c.anglerId) &&
      anglersById.get(c.anglerId)?.disqualified !== true,
  );

  switch (bet.scoring) {
    case 'most': {
      const byAngler = new Map<string, Catch[]>();
      for (const c of eligible) {
        const list = byAngler.get(c.anglerId) ?? [];
        list.push(c);
        byAngler.set(c.anglerId, list);
      }
      const tallies = [...byAngler.values()].map((list) => list.sort(byEarliest));
      const most = Math.max(0, ...tallies.map((t) => t.length));
      if (most === 0) return null;
      // A tie on the count goes to whoever reached it first: the time of
      // their most-th fish.
      const level = tallies.filter((t) => t.length === most);
      const reached = level
        .map((t) => t[most - 1])
        .filter((c): c is Catch => c !== undefined)
        .sort(byEarliest);
      const [leader] = reached;
      if (!leader) return null;
      return {
        scoring: 'most',
        anglerId: leader.anglerId,
        fishCount: most,
        gotThereFirst: level.length > 1,
      };
    }
    case 'first': {
      const [first] = [...eligible].sort(byEarliest);
      return first ? { scoring: 'first', anglerId: first.anglerId, at: first.loggedAt } : null;
    }
    case 'smallest': {
      const [small] = [...eligible].sort(bySmallestThenEarliest);
      return small
        ? { scoring: 'smallest', anglerId: small.anglerId, lengthInches: small.lengthInches }
        : null;
    }
  }
}
