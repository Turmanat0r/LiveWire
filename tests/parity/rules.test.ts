// Every rule ported from the old app, run side by side with the old app on the
// same random inputs. A difference fails with the input that caused it.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadLegacy, withFixed, type LegacyAngler, type LegacyCatch } from './legacy';
import type { Angler, Catch, LatLng } from '../../src/domain/types';
import { bigFishLeader, indexAnglers, standings } from '../../src/domain/scoring';
import { betLeader, type Bet } from '../../src/domain/bets';
import { eligibleEntries, outstandingFees, paidEntries, splitPool } from '../../src/domain/money';
import {
  bearingFrom,
  compassFrom,
  evaluateBoundary,
  milesBetween,
  offsetLatLng,
  type Boundary,
} from '../../src/domain/geo';
import { dateRangeText, formatCountdown, zonedParts } from '../../src/domain/time';
import { overdueAnglers, sortOverdue, type CheckIn } from '../../src/domain/safety';
import { generateHandle, uniqueHandle } from '../../src/domain/handles';
import { normalizePhone } from '../../src/domain/identity';
import { hammingHex, photoHashDistance } from '../../src/domain/photo';
import { seededRandom, tournamentArb } from '../../src/test/arbitraries';

const legacy = loadLegacy();
const RUNS = 2_000;

/**
 * A plain decimal between min and max, to six places. Not fc.double: that
 * spreads its picks across the binary encoding, so nearly every "random
 * distance up to 8 miles" it draws is something like 1e-200 miles, and every
 * point lands on the launch. A planted fault went unnoticed because of it.
 */
const decimal = (min: number, max: number) =>
  fc.integer({ min: Math.round(min * 1e6), max: Math.round(max * 1e6) }).map((n) => n / 1e6);

function toLegacyAngler(a: Angler): LegacyAngler {
  return {
    id: a.id,
    name: `Name of ${a.id}`,
    handle: a.handle,
    division: a.division,
    role: a.role,
    teamId: a.teamId,
    bigfish: a.bigFish,
    ...(a.feePaid ? {} : { pending: true as const }),
    disqualified: a.disqualified,
  };
}

function toLegacyCatch(c: Catch): LegacyCatch {
  return {
    id: c.id,
    anglerId: c.anglerId,
    division: c.division,
    species: c.species,
    length: c.lengthInches,
    timestamp: c.loggedAt,
    status: c.status,
  };
}

describe('scoring matches the old app', () => {
  const scoring = ['Walleye', 'Pike'];

  it('standings, both divisions', () => {
    fc.assert(
      fc.property(tournamentArb, ({ anglers, catches }) => {
        const la = anglers.map(toLegacyAngler);
        const lc = catches.map(toLegacyCatch);
        for (const division of ['solo', 'team'] as const) {
          const old = legacy.standingsFor(division, lc, la, scoring).map((r) => ({
            key: r.key,
            anglerIds: [...r.anglerIds].sort(),
            best: r.best,
            bestAt: r.bestAt,
            top3: r.top3sum,
            count: r.count,
          }));
          const now = standings(division, catches, anglers, scoring).map((r) => ({
            key: r.key,
            anglerIds: [...r.anglerIds],
            best: r.bestInches,
            bestAt: r.bestAt,
            top3: r.top3Inches,
            count: r.fishCount,
          }));
          expect(now).toEqual(old);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('the Big Fish winner', () => {
    fc.assert(
      fc.property(tournamentArb, ({ anglers, catches }) => {
        const old = legacy.bigFishWinner(
          anglers.map(toLegacyAngler),
          catches.map(toLegacyCatch),
          scoring,
        );
        const now = bigFishLeader(catches, anglers, scoring);
        expect(
          now ? { anglerId: now.anglerId, catchId: now.id, length: now.lengthInches } : null,
        ).toEqual(old);
      }),
      { numRuns: RUNS },
    );
  });

  it('side bets: most, first and smallest', () => {
    // The old app scores bets against the live event's species, which in a
    // device-only load is the first built-in event's: walleye.
    fc.assert(
      fc.property(
        tournamentArb,
        fc.constantFrom('most', 'first', 'smallest' as const),
        fc.integer({ min: 0, max: 255 }),
        ({ anglers, catches }, scoring, mask) => {
          const entrants = anglers.filter((_, i) => (mask >> (i % 8)) & 1).map((a) => a.id);
          const bet: Bet = {
            id: 'b',
            title: 't',
            stake: '',
            scoring,
            creatorId: 'x',
            winnerId: null,
          };
          const la = anglers.map(toLegacyAngler);
          const old = legacy.betStanding(
            { kind: 'bet', id: 'b', scoring },
            entrants.map((anglerId, i) => ({ kind: 'join', id: `j${i}`, betId: 'b', anglerId })),
            catches.map(toLegacyCatch),
            Object.fromEntries(la.map((a) => [a.id, a])),
          );
          const now = betLeader(bet, entrants, catches, indexAnglers(anglers), ['Walleye']);
          expect(now?.anglerId ?? null).toBe(old?.anglerId ?? null);
          if (now?.scoring === 'most') {
            expect(old?.detail).toBe(
              `${now.fishCount} approved fish${now.gotThereFirst ? ', got there first' : ''}`,
            );
          }
          if (now?.scoring === 'smallest')
            expect(old?.detail).toBe(`${now.lengthInches.toFixed(2)}"`);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('money matches the old app', () => {
  it('pool splits, to the cent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (eligible, cents) => {
          const old = legacy
            .splitFor(eligible, cents / 100)
            .map((a) => ({ place: a.place, cents: Math.round(a.amount * 100) }));
          expect(splitPool(eligible, cents)).toEqual(old);
        },
      ),
      { numRuns: 20_000 },
    );
  });

  it('entry counts and outstanding fees', () => {
    fc.assert(
      fc.property(tournamentArb, ({ anglers }) => {
        const la = anglers.map(toLegacyAngler);
        const paid = legacy.poolCounts(la);
        expect(paidEntries(anglers)).toEqual({
          solo: paid.solo,
          teams: paid.teams,
          bigFish: paid.bigfish,
        });
        const owed = legacy.outstandingFees(la);
        const fees = outstandingFees(anglers, {
          soloCents: 3000,
          teamCents: 5000,
          bigFishCents: 1000,
        });
        expect(fees).toEqual({
          solo: owed.solo,
          teams: owed.teams,
          bigFish: owed.bigfish,
          totalCents: owed.total * 100,
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('places each division can fill', () => {
    // The old app works this out inline in the payout screen; this is its
    // logic, applied to the same anglers, so the extraction is checked too.
    fc.assert(
      fc.property(tournamentArb, ({ anglers }) => {
        const confirmed = anglers.filter((a) => a.feePaid);
        const solo = confirmed
          .filter((a) => a.division === 'solo')
          .filter((a) => !a.disqualified).length;
        const teams = confirmed
          .filter((a) => a.division === 'team' && a.role !== 'partner')
          .filter(
            (e) =>
              !e.disqualified ||
              (!!e.teamId &&
                anglers.some((a) => a.teamId === e.teamId && a.id !== e.id && !a.disqualified)),
          ).length;
        expect(eligibleEntries(anglers)).toEqual({ solo, teams });
      }),
      { numRuns: RUNS },
    );
  });
});

describe('the course matches the old app', () => {
  const LAUNCH: LatLng = { lat: 46.38917, lng: -111.57556 };
  const near = fc
    .record({
      miles: decimal(0, 8),
      bearing: decimal(-Math.PI, Math.PI),
    })
    .map(({ miles, bearing }) => offsetLatLng(LAUNCH, miles, bearing));

  const boundaryArb: fc.Arbitrary<Boundary> = fc.oneof(
    fc.constant<Boundary>({ kind: 'none' }),
    fc
      .record({ center: near, radiusMiles: decimal(0, 6) })
      .map((b): Boundary => ({ kind: 'circle', ...b })),
    fc
      .array(near, { minLength: 0, maxLength: 9 })
      .map((points): Boundary => ({ kind: 'polygon', points })),
  );

  it('inside or outside, and by how far', () => {
    fc.assert(
      fc.property(near, boundaryArb, (p, b) => {
        const old = legacy.evaluateBoundary(
          p.lat,
          p.lng,
          b.kind === 'polygon' ? { kind: 'polygon', points: [...b.points] } : b,
        );
        const now = evaluateBoundary(p, b);
        switch (now.kind) {
          case 'unchecked':
            expect(old).toEqual({ withinBounds: null, outsideMiles: 0 });
            break;
          case 'circle':
            expect(old).toEqual({
              withinBounds: now.within,
              distanceMiles: now.fromLaunchMiles,
              outsideMiles: now.outsideMiles,
            });
            break;
          case 'polygon':
            expect(old).toEqual({
              withinBounds: now.within,
              edgeMiles: now.edgeMiles,
              outsideMiles: now.outsideMiles,
            });
            break;
        }
      }),
      { numRuns: 20_000 },
    );
  });

  it('a point exactly on a corner of the line', () => {
    // Random points never land on the line itself, so the corners are tested
    // on purpose: that is where < and <= disagree.
    fc.assert(
      // Unbiased: the default generator favours extremes (zero miles, exactly
      // due south), which mostly builds collapsed polygons with nothing to find.
      fc.property(
        fc.array(fc.noBias(near), { minLength: 3, maxLength: 9 }),
        fc.nat(),
        (points, k) => {
          const p = points[k % points.length] ?? LAUNCH;
          const old = legacy.evaluateBoundary(p.lat, p.lng, { kind: 'polygon', points });
          const now = evaluateBoundary(p, { kind: 'polygon', points });
          expect(now.kind === 'polygon' && now.within).toBe(old.withinBounds);
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it('distance, offset, bearing and compass', () => {
    fc.assert(
      fc.property(near, near, decimal(0, 10), decimal(-4, 4), (a, b, miles, bearing) => {
        expect(milesBetween(a, b)).toBe(legacy.milesBetween(a.lat, a.lng, b.lat, b.lng));
        expect(offsetLatLng(a, miles, bearing)).toEqual(legacy.offsetLatLng(a, miles, bearing));
        expect(bearingFrom(a, b)).toBe(legacy.bearingFrom(a, b));
        expect(compassFrom(a, b)).toBe(legacy.compassFrom(a, b));
      }),
      { numRuns: 20_000 },
    );
  });
});

describe('the clock matches the old app', () => {
  // The old app reads the live event's zone; device-only, that is the first
  // built-in event, on Mountain time.
  const ZONE = 'America/Denver';
  const instant = fc.integer({
    min: Date.parse('2026-01-01T00:00:00Z'),
    max: Date.parse('2029-12-31T23:59:59Z'),
  });

  it('date and time of day on the event clock, across daylight saving changes', () => {
    fc.assert(
      fc.property(instant, (at) => {
        const old = legacy.eventTimeParts(at);
        expect(zonedParts(at, ZONE)).toEqual({ dateKey: old.dateKey, secondsOfDay: old.seconds });
      }),
      { numRuns: 20_000 },
    );
  });

  it('countdowns and date ranges', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 200_000 }), (s) => {
        expect(formatCountdown(s)).toBe(legacy.formatCountdown(s));
      }),
      { numRuns: 5_000 },
    );
    const day = fc
      .integer({ min: 0, max: 3 * 365 })
      .map((d) => new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10));
    fc.assert(
      fc.property(fc.uniqueArray(day, { minLength: 1, maxLength: 7 }), (days) => {
        const dates = [...days].sort();
        expect(dateRangeText(dates)).toBe(legacy.eventDateRangeText({ dates }));
      }),
      { numRuns: 5_000 },
    );
  });

  it('who is overdue off the water, and in what order', () => {
    const DATES = ['2027-09-18', '2027-09-19'];
    const dayStart = (d: number) => Date.parse(`${DATES[d] ?? ''}T00:00:00-06:00`);
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            day1: fc.record({
              in: fc.option(fc.nat(86_400_000)),
              out: fc.option(fc.nat(86_400_000)),
            }),
            day2: fc.record({
              in: fc.option(fc.nat(86_400_000)),
              out: fc.option(fc.nat(86_400_000)),
            }),
            seenMinutesAgo: fc.option(fc.integer({ min: 1, max: 600 })),
          }),
          { maxLength: 12 },
        ),
        fc.integer({ min: 0, max: 1 }),
        fc.integer({ min: 0, max: 86_399 }),
        (people, d, second) => {
          const now = dayStart(d) + second * 1000;
          const la: LegacyAngler[] = people.map((p, i) => ({
            id: `a${i}`,
            name: `Angler ${String.fromCharCode(97 + ((i * 7) % 26))}`,
            handle: `h${i}`,
            division: 'solo',
            role: 'solo',
            teamId: null,
            bigfish: false,
            checkins: {
              day1: {
                in: p.day1.in === null ? null : dayStart(0) + p.day1.in,
                out: p.day1.out === null ? null : dayStart(0) + p.day1.out,
              },
              day2: {
                in: p.day2.in === null ? null : dayStart(1) + p.day2.in,
                out: p.day2.out === null ? null : dayStart(1) + p.day2.out,
              },
            },
          }));
          const checkIns: CheckIn[] = la.flatMap((a) =>
            (['day1', 'day2'] as const).map((k, i) => ({
              anglerId: a.id,
              date: DATES[i] ?? '',
              inAt: a.checkins?.[k]?.in ?? null,
              outAt: a.checkins?.[k]?.out ?? null,
            })),
          );
          const signals = people.flatMap((p, i) =>
            p.seenMinutesAgo === null ? [] : [{ id: `a${i}`, at: now - p.seenMinutesAgo * 60_000 }],
          );

          const old = withFixed({ now }, () => {
            const list = legacy.overdueCheckouts(la, now);
            return {
              list: list.map((x) => ({ anglerId: x.angler.id, overdueSeconds: x.overdueSeconds })),
              order: legacy
                .sortOverdue(
                  list.map((x) => ({ ...x, dayKey: '' })),
                  signals,
                )
                .map((x) => x.angler.id),
            };
          });
          const list = overdueAnglers(checkIns, now, DATES, ZONE);
          const names = new Map(la.map((a) => [a.id, a.name]));
          const order = sortOverdue(
            list,
            new Map(signals.map((s) => [s.id, s.at])),
            (id) => names.get(id) ?? '',
            now,
          );
          expect({ list, order: order.map((x) => x.anglerId) }).toEqual(old);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('identity and photos match the old app', () => {
  it('handles, from the same random numbers', () => {
    fc.assert(
      fc.property(fc.nat(), (seed) => {
        const old = withFixed({ random: seededRandom(seed) }, () => legacy.generateHandle());
        expect(generateHandle(seededRandom(seed))).toBe(old);
      }),
      { numRuns: 20_000 },
    );
  });

  it('a unique handle against a roster that already holds many', () => {
    fc.assert(
      fc.property(fc.nat(), fc.integer({ min: 0, max: 400 }), (seed, size) => {
        const roster: string[] = [];
        const fill = seededRandom(seed ^ 0x5bd1e995);
        for (let i = 0; i < size; i++) roster.push(generateHandle(fill));
        const old = withFixed({ random: seededRandom(seed) }, () =>
          legacy.uniqueHandle(roster.map((handle) => ({ handle }))),
        );
        expect(uniqueHandle(roster, seededRandom(seed))).toBe(old);
      }),
      { numRuns: 1_000 },
    );
  });

  it('phone numbers', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'0123456789 ()-+.x'.split('')), maxLength: 20 }),
        (s) => {
          expect(normalizePhone(s)).toBe(legacy.normPhone(s));
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it('fingerprint distances, whole and cropped', () => {
    const hex = fc.string({
      unit: fc.constantFrom(...'0123456789abcdef'.split('')),
      minLength: 16,
      maxLength: 16,
    });
    const hashes = fc.array(hex, { minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(hex, hex, hashes, hashes, (a, b, ha, hb) => {
        expect(hammingHex(a, b)).toBe(legacy.hammingHex(a, b));
        const old = legacy.photoHashDistance(
          { hash: ha[0] ?? '', hashes: ha },
          { hash: hb[0] ?? '', hashes: hb },
        );
        expect(photoHashDistance(ha, hb)).toEqual(old);
      }),
      { numRuns: 10_000 },
    );
  });
});
