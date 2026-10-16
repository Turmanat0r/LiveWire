import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Angler } from './types';
import {
  DEFAULT_PAYOUT,
  dollarsText,
  eligibleEntries,
  outstandingFees,
  paidEntries,
  parseDollars,
  splitPool,
} from './money';

const FEES = { soloCents: 3000, teamCents: 5000, bigFishCents: 1000 };

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

describe('splitPool', () => {
  it('splits 50/30/20 to the cent and hands the odd cent to the place that lost most', () => {
    // $300.05: 150.025 / 90.015 / 60.01 must add up to 30005 cents exactly.
    const awards = splitPool(3, 30_005);
    expect(awards.map((a) => a.cents)).toEqual([15_003, 9_001, 6_001]);
    expect(awards.reduce((s, a) => s + a.cents, 0)).toBe(30_005);
  });

  it('pays only the places the field can fill, and does not redistribute the rest', () => {
    expect(splitPool(2, 10_000)).toEqual([
      { place: '1st', cents: 5_000 },
      { place: '2nd', cents: 3_000 },
    ]);
    expect(splitPool(0, 10_000)).toEqual([]);
  });

  it('always pays out exactly the filled places’ share of the pool', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 50_000_00 }),
        (entries, pool) => {
          const awards = splitPool(entries, pool);
          const places = DEFAULT_PAYOUT.slice(0, Math.min(entries, DEFAULT_PAYOUT.length));
          const bp = places.reduce((s, p) => s + p.basisPoints, 0);
          expect(awards).toHaveLength(places.length);
          expect(awards.reduce((s, a) => s + a.cents, 0)).toBe(Math.round((pool * bp) / 10_000));
          for (const a of awards) expect(Number.isInteger(a.cents)).toBe(true);
          // Higher places never get less than lower ones.
          for (let i = 1; i < awards.length; i++) {
            expect((awards[i - 1]?.cents ?? 0) >= (awards[i]?.cents ?? 0)).toBe(true);
          }
        },
      ),
      { numRuns: 2_000 },
    );
  });
});

describe('entry counts and fees', () => {
  const team = (id: string, role: 'captain' | 'partner', over: Partial<Angler> = {}) =>
    angler(id, { division: 'team', role, teamId: 't1', ...over });

  it('counts a team once and Big Fish per angler, from paid entries only', () => {
    const anglers = [
      angler('s1', { bigFish: true }),
      angler('s2', { feePaid: false }),
      team('c', 'captain', { bigFish: true }),
      team('p', 'partner', { bigFish: true }),
    ];
    expect(paidEntries(anglers)).toEqual({ solo: 1, teams: 1, bigFish: 3 });
    expect(outstandingFees(anglers, FEES)).toEqual({
      solo: 1,
      teams: 0,
      bigFish: 0,
      totalCents: 3000,
    });
  });

  it('keeps a team’s place while either member is eligible', () => {
    expect(
      eligibleEntries([team('c', 'captain', { disqualified: true }), team('p', 'partner')]).teams,
    ).toBe(1);
    expect(
      eligibleEntries([
        team('c', 'captain', { disqualified: true }),
        team('p', 'partner', { disqualified: true }),
      ]).teams,
    ).toBe(0);
    expect(eligibleEntries([angler('s', { disqualified: true })]).solo).toBe(0);
  });
});

describe('dollars', () => {
  it('are whole when they can be, and to the cent when not', () => {
    expect(dollarsText(3000)).toBe('$30');
    expect(dollarsText(1250)).toBe('$12.50');
    expect(dollarsText(0)).toBe('$0');
  });
});

describe('parseDollars', () => {
  it('reads dollars however they are typed', () => {
    expect(parseDollars('25')).toBe(2500);
    expect(parseDollars('25.5')).toBe(2550);
    expect(parseDollars(' $1,250.05 ')).toBe(125_005);
    expect(parseDollars('.75')).toBe(75);
    expect(parseDollars('0')).toBe(0);
  });

  it('refuses what is not an amount', () => {
    for (const text of ['', '.', '$', '-5', '2.505', 'ten', '12 50', '99999999']) {
      expect(parseDollars(text)).toBeNull();
    }
  });
});
