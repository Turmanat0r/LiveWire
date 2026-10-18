// The state's contest report, run side by side with the old app on the same
// random tournaments. The report goes to Montana FWP, so every number on it
// has to be the number the old app would have filed.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadLegacy, type LegacyAngler, type LegacyCatch } from './legacy';
import type { Angler, Catch, CatchStatus } from '../../src/domain/types';
import type { CheckIn } from '../../src/domain/safety';
import {
  catchesPerDay,
  dayHours,
  dayRow,
  fieldCounts,
  reportDue,
  residencyCounts,
  sizeDistribution,
  speciesTally,
  winningFish,
  type ReportAngler,
} from '../../src/domain/report';
import { SPECIES, tournamentArb } from '../../src/test/arbitraries';

const legacy = loadLegacy();
const RUNS = 2_000;
// The old app's own event: these dates, this clock, walleye.
const DATES = ['2027-09-18', '2027-09-19'];
const ZONE = 'America/Denver';
const dayStart = (d: number) => Date.parse(`${DATES[d] ?? ''}T00:00:00-06:00`);

const residencyArb = fc.constantFrom<boolean | null>(true, false, null);

function reportAngler(a: Angler, resident: boolean | null): ReportAngler {
  return {
    id: a.id,
    division: a.division,
    role: a.role,
    feePaid: a.feePaid,
    disqualified: a.disqualified,
    resident,
  };
}

function toLegacyAngler(a: ReportAngler): LegacyAngler {
  return {
    id: a.id,
    name: `Name of ${a.id}`,
    handle: a.id,
    division: a.division,
    role: a.role,
    teamId: a.division === 'team' ? `team-${a.id}` : null,
    bigfish: false,
    ...(a.feePaid ? {} : { pending: true as const }),
    disqualified: a.disqualified,
    ...(a.resident === null ? {} : { resident: a.resident }),
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

/** Fish landed around the event: the day before, either day, and after. */
const fishArb = fc.array(
  fc.record({
    species: fc.constantFrom<string>(...SPECIES, ''),
    inches: fc.integer({ min: 0, max: 160 }).map((q) => q / 4),
    minute: fc.integer({ min: -1440, max: 4320 }),
    status: fc.constantFrom<CatchStatus>('approved', 'approved', 'pending', 'rejected'),
  }),
  { maxLength: 40 },
);

function fishFrom(
  list: readonly { species: string; inches: number; minute: number; status: CatchStatus }[],
): Catch[] {
  return list.map((f, i) => ({
    id: `f${String(i).padStart(3, '0')}`,
    anglerId: `a${String(i % 5)}`,
    division: 'solo',
    species: f.species,
    lengthInches: f.inches,
    loggedAt: dayStart(0) + f.minute * 60_000,
    status: f.status,
  }));
}

describe('the state contest report matches the old app', () => {
  it('the head of the form: anglers, teams, paid and residency', () => {
    fc.assert(
      fc.property(tournamentArb, fc.array(residencyArb, { maxLength: 30 }), ({ anglers }, res) => {
        const people = anglers.map((a, i) => reportAngler(a, res[i] ?? null));
        const la = people.map(toLegacyAngler);
        expect(fieldCounts(people)).toEqual(legacy.reportFieldCounts(la));
        const old = legacy.residencyCounts(la);
        expect(residencyCounts(people)).toEqual({
          resident: old.resident,
          nonresident: old.nonresident,
          unknown: old.unknown,
          unknownIds: old.unknownAnglers.map((a) => a.id),
        });
      }),
      { numRuns: RUNS },
    );
  });

  it('hours fished each day, from the check-ins, with or without times typed over them', () => {
    const slot = fc.option(fc.integer({ min: 1, max: 86_399 }).map((s) => s * 1000));
    fc.assert(
      fc.property(
        fc.array(fc.record({ in1: slot, out1: slot, in2: slot, out2: slot }), { maxLength: 10 }),
        fc.option(fc.constantFrom('06:45', '05:00', '13:30', 'nonsense')),
        (people, typedStart) => {
          const la: LegacyAngler[] = people.map((p, i) => ({
            id: `a${String(i)}`,
            name: `a${String(i)}`,
            handle: `a${String(i)}`,
            division: 'solo',
            role: 'solo',
            teamId: null,
            bigfish: false,
            checkins: {
              day1: {
                in: p.in1 === null ? null : dayStart(0) + p.in1,
                out: p.out1 === null ? null : dayStart(0) + p.out1,
              },
              day2: {
                in: p.in2 === null ? null : dayStart(1) + p.in2,
                out: p.out2 === null ? null : dayStart(1) + p.out2,
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
          const old = legacy.contestDayHours(la, DATES);
          const mine = dayHours(checkIns, DATES);
          // The old rows carry a "day1" key too; every other field must match.
          expect(old).toHaveLength(mine.length);
          mine.forEach((d, i) => {
            expect(old[i]).toMatchObject(d);
          });

          const typed = typedStart === null ? {} : { start: typedStart };
          mine.forEach((d, i) => {
            const oldDay = old[i];
            if (!oldDay) throw new Error('a day row');
            const oldRow = legacy.reportDayRow(oldDay, { hours: { [oldDay.dayKey]: typed } });
            expect(oldRow).toMatchObject(dayRow(d, typed, ZONE));
          });
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('fish per day on the event clock, and those outside its dates', () => {
    fc.assert(
      fc.property(fishArb, (list) => {
        const catches = fishFrom(list);
        expect(catchesPerDay(catches, DATES, ZONE)).toEqual(
          legacy.catchesPerDay(catches.map(toLegacyCatch), DATES),
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('fish caught, released and died, by species', () => {
    fc.assert(
      fc.property(
        fishArb,
        fc.dictionary(
          fc.constantFrom<string>(...SPECIES, 'Unknown'),
          fc.integer({ min: -3, max: 50 }),
        ),
        (list, died) => {
          const catches = fishFrom(list);
          expect(speciesTally(catches, died)).toEqual(
            legacy.speciesTally(catches.map(toLegacyCatch), died),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('the two size tables, every fish reported once', () => {
    fc.assert(
      fc.property(fishArb, (list) => {
        const catches = fishFrom(list);
        expect(sizeDistribution(catches)).toEqual(
          legacy.sizeDistribution(catches.map(toLegacyCatch)),
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('the size of the winning fish', () => {
    fc.assert(
      fc.property(tournamentArb, ({ anglers, catches }) => {
        const people = anglers.map((a) => reportAngler(a, true));
        const old = legacy.winningFish(catches.map(toLegacyCatch), people.map(toLegacyAngler));
        expect(winningFish(catches, people, ['Walleye'])?.id ?? null).toBe(old?.id ?? null);
      }),
      { numRuns: RUNS },
    );
  });

  it('the deadline, thirty days from the last day fished', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .integer({ min: 0, max: 3650 })
            .map((n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10)),
          { maxLength: 4 },
        ),
        (dates) => {
          const old = legacy.reportDueDate({ dates });
          expect(reportDue(dates, 0)?.due ?? null).toBe(old ? old.getTime() : null);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
