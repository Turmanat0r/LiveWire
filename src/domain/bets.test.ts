import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Angler, Catch } from './types';
import { betLeader, type Bet } from './bets';
import { indexAnglers } from './scoring';
import { shuffled, tournamentArb } from '../test/arbitraries';

const WALLEYE = ['Walleye'];
const bet = (scoring: Bet['scoring']): Bet => ({
  id: 'b1',
  title: 'Test',
  stake: '',
  scoring,
  creatorId: 'a',
  winnerId: null,
});

const anglers: Angler[] = ['a', 'b', 'c'].map((id) => ({
  id,
  handle: id,
  division: 'solo',
  role: 'solo',
  teamId: null,
  bigFish: false,
  feePaid: true,
  disqualified: false,
}));

const fish = (id: string, anglerId: string, lengthInches: number, loggedAt: number): Catch => ({
  id,
  anglerId,
  division: 'solo',
  species: 'Walleye',
  lengthInches,
  loggedAt,
  status: 'approved',
});

describe('betLeader', () => {
  const byId = indexAnglers(anglers);

  it('gives a tie on "most fish" to whoever got there first', () => {
    const catches = [
      fish('1', 'a', 15, 10),
      fish('2', 'b', 15, 5),
      fish('3', 'a', 15, 30),
      fish('4', 'b', 15, 20),
    ];
    expect(betLeader(bet('most'), ['a', 'b'], catches, byId, WALLEYE)).toEqual({
      scoring: 'most',
      anglerId: 'b',
      fishCount: 2,
      gotThereFirst: true,
    });
  });

  it('calls "smallest" and "first" from approved fish of entrants only', () => {
    const catches = [fish('1', 'a', 12, 50), fish('2', 'b', 12, 40), fish('3', 'c', 8, 1)];
    expect(betLeader(bet('smallest'), ['a', 'b'], catches, byId, WALLEYE)).toMatchObject({
      anglerId: 'b',
    });
    expect(betLeader(bet('first'), ['a', 'b'], catches, byId, WALLEYE)).toMatchObject({
      anglerId: 'b',
      at: 40,
    });
  });

  it('cannot be called with nobody in, nothing caught, or by hand', () => {
    expect(betLeader(bet('first'), [], [fish('1', 'a', 10, 1)], byId, WALLEYE)).toBeNull();
    expect(betLeader(bet('first'), ['a'], [], byId, WALLEYE)).toBeNull();
    expect(betLeader(bet('manual'), ['a'], [fish('1', 'a', 10, 1)], byId, WALLEYE)).toBeNull();
  });

  it('names the same leader whatever order the catches arrive in', () => {
    fc.assert(
      fc.property(
        tournamentArb,
        fc.nat(),
        fc.constantFrom('most', 'first', 'smallest' as const),
        (t, seed, scoring) => {
          const entrants = t.anglers.map((a) => a.id);
          const ix = indexAnglers(t.anglers);
          expect(betLeader(bet(scoring), entrants, shuffled(t.catches, seed), ix, WALLEYE)).toEqual(
            betLeader(bet(scoring), entrants, t.catches, ix, WALLEYE),
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});
