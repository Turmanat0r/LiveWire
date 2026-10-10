import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Angler, Catch } from './types';
import { bigFishBoard, isScoringSpecies, rankOf, standings } from './scoring';
import { nth, shuffled, tournamentArb } from '../test/arbitraries';

const WALLEYE = ['Walleye'];

function angler(id: string, over: Partial<Angler> = {}): Angler {
  return {
    id,
    handle: id,
    division: 'solo',
    role: 'solo',
    teamId: null,
    bigFish: false,
    feePaid: true,
    disqualified: false,
    ...over,
  };
}

function fish(
  id: string,
  anglerId: string,
  lengthInches: number,
  loggedAt: number,
  over: Partial<Catch> = {},
): Catch {
  return {
    id,
    anglerId,
    division: 'solo',
    species: 'Walleye',
    lengthInches,
    loggedAt,
    status: 'approved',
    ...over,
  };
}

describe('isScoringSpecies', () => {
  it('never scores the Other bucket, even if a list names it', () => {
    expect(isScoringSpecies('Other', ['Other', 'Walleye'])).toBe(false);
  });
  it('scores any species on the list', () => {
    expect(isScoringSpecies('Pike', ['Walleye', 'Pike'])).toBe(true);
    expect(isScoringSpecies('Perch', ['Walleye', 'Pike'])).toBe(false);
  });
});

describe('standings', () => {
  it('ranks on the longest fish, then best three, then the earliest best fish', () => {
    const anglers = [angler('a'), angler('b'), angler('c')];
    const catches = [
      fish('1', 'a', 24, 300),
      fish('2', 'b', 24, 100),
      fish('3', 'c', 24, 200),
      fish('4', 'c', 18, 400),
    ];
    const rows = standings('solo', catches, anglers, WALLEYE);
    // c has the same best fish but a better three; b got to 24" before a.
    expect(rows.map((r) => r.key)).toEqual(['c', 'b', 'a']);
    expect(rows[0]?.top3Inches).toBe(42);
  });

  it('only counts approved fish of a scoring species in the right division', () => {
    const anglers = [angler('a')];
    const catches = [
      fish('1', 'a', 30, 1, { status: 'pending' }),
      fish('2', 'a', 29, 2, { status: 'rejected' }),
      fish('3', 'a', 28, 3, { species: 'Other' }),
      fish('4', 'a', 27, 4, { division: 'team' }),
      fish('5', 'a', 20, 5),
    ];
    expect(standings('solo', catches, anglers, WALLEYE)[0]?.bestInches).toBe(20);
  });

  it('ranks a team as one, and keeps a teammate when the other is disqualified', () => {
    const team = { division: 'team' as const, teamId: 't1' };
    const anglers = [
      angler('cap', { ...team, role: 'captain', disqualified: true }),
      angler('mate', { ...team, role: 'partner' }),
    ];
    const catches = [
      fish('1', 'cap', 30, 1, { division: 'team' }),
      fish('2', 'mate', 22, 2, { division: 'team' }),
    ];
    const rows = standings('team', catches, anglers, WALLEYE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 't1', bestInches: 22, anglerIds: ['mate'] });
  });

  it('gives the same table whatever order the catches arrive in', () => {
    fc.assert(
      fc.property(tournamentArb, fc.nat(), ({ anglers, catches }, seed) => {
        const reordered = shuffled(catches, seed);
        for (const division of ['solo', 'team'] as const) {
          expect(standings(division, reordered, anglers, WALLEYE)).toEqual(
            standings(division, catches, anglers, WALLEYE),
          );
        }
      }),
      { numRuns: 500 },
    );
  });

  it('never ranks a disqualified angler or a fish that does not count', () => {
    fc.assert(
      fc.property(tournamentArb, ({ anglers, catches }) => {
        const dq = new Set(anglers.filter((a) => a.disqualified).map((a) => a.id));
        for (const division of ['solo', 'team'] as const) {
          for (const row of standings(division, catches, anglers, WALLEYE)) {
            expect(row.anglerIds.some((id) => dq.has(id))).toBe(false);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('rankOf', () => {
  it('is 1-based, and 0 for an angler with nothing on the board', () => {
    const anglers = [angler('a'), angler('b'), angler('c')];
    const catches = [fish('1', 'a', 20, 1), fish('2', 'b', 25, 2)];
    expect(rankOf(nth(anglers, 1), catches, anglers, WALLEYE)).toBe(1);
    expect(rankOf(nth(anglers, 0), catches, anglers, WALLEYE)).toBe(2);
    expect(rankOf(nth(anglers, 2), catches, anglers, WALLEYE)).toBe(0);
  });
});

describe('bigFishBoard', () => {
  it('lists only entrants who are still eligible, longest then earliest', () => {
    const anglers = [
      angler('in', { bigFish: true }),
      angler('out', { bigFish: false }),
      angler('dq', { bigFish: true, disqualified: true }),
      angler('early', { bigFish: true }),
    ];
    const catches = [
      fish('1', 'in', 26, 50),
      fish('2', 'out', 40, 1),
      fish('3', 'dq', 39, 1),
      fish('4', 'early', 26, 10),
    ];
    expect(bigFishBoard(catches, anglers, WALLEYE).map((c) => c.id)).toEqual(['4', '1']);
  });
});
