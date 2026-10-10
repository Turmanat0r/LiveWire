// Random tournaments for property tests. Lengths come off a bump board in
// quarter inches, so ties are common, which is the point: ties are where
// ranking rules go wrong.
import fc from 'fast-check';
import type { Angler, Catch, CatchStatus, Division } from '../domain/types';

export const SPECIES = ['Walleye', 'Pike', 'Perch', 'Other'] as const;

export interface Tournament {
  readonly anglers: Angler[];
  readonly catches: Catch[];
}

const id = (prefix: string, n: number) => `${prefix}${n.toString(36).padStart(3, '0')}`;

export const tournamentArb: fc.Arbitrary<Tournament> = fc
  .record({
    solos: fc.array(
      fc.record({
        bigFish: fc.boolean(),
        feePaid: fc.boolean(),
        dq: fc.integer({ min: 0, max: 9 }),
      }),
      { maxLength: 8 },
    ),
    teams: fc.array(
      fc.record({
        bigFish: fc.boolean(),
        feePaid: fc.boolean(),
        dqCaptain: fc.integer({ min: 0, max: 9 }),
        dqPartner: fc.integer({ min: 0, max: 9 }),
      }),
      { maxLength: 5 },
    ),
    fish: fc.array(
      fc.record({
        who: fc.nat(),
        species: fc.constantFrom(...SPECIES),
        quarters: fc.integer({ min: 40, max: 130 }),
        minute: fc.integer({ min: 0, max: 60 }),
        status: fc.constantFrom<CatchStatus>(
          'approved',
          'approved',
          'approved',
          'pending',
          'rejected',
        ),
      }),
      { maxLength: 40 },
    ),
  })
  .map(({ solos, teams, fish }) => {
    const anglers: Angler[] = [];
    solos.forEach((s, i) => {
      anglers.push({
        id: id('s', i),
        handle: `Solo ${i}`,
        division: 'solo',
        role: 'solo',
        teamId: null,
        bigFish: s.bigFish,
        feePaid: s.feePaid,
        disqualified: s.dq === 0,
      });
    });
    teams.forEach((t, i) => {
      const teamId = id('t', i);
      const base = { division: 'team' as Division, teamId, bigFish: t.bigFish, feePaid: t.feePaid };
      anglers.push({
        ...base,
        id: id('c', i),
        handle: `Captain ${i}`,
        role: 'captain',
        disqualified: t.dqCaptain === 0,
      });
      anglers.push({
        ...base,
        id: id('p', i),
        handle: `Partner ${i}`,
        role: 'partner',
        disqualified: t.dqPartner === 0,
      });
    });
    const catches: Catch[] = fish.flatMap((f, i) => {
      const angler = anglers[f.who % Math.max(1, anglers.length)];
      if (!angler) return [];
      return [
        {
          id: id('f', i),
          anglerId: angler.id,
          division: angler.division,
          species: f.species,
          lengthInches: f.quarters / 4,
          // A narrow window, so equal timestamps happen too.
          loggedAt: 1_800_000_000_000 + f.minute * 60_000,
          status: f.status,
        },
      ];
    });
    return { anglers, catches };
  });

/** A seeded source of numbers in [0, 1), so two implementations can share one sequence. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy of the list in a different order, decided by the seed. */
export function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** The item at an index, or a failed test saying it was not there. */
export function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`expected an item at index ${index} of ${list.length}`);
  return item;
}
