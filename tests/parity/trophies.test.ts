// The trophy case, run side by side with the old app on the same random
// careers: several tournaments, some frozen and some not, your anglers among
// strangers. Every best, every line of history and every badge has to come
// out the same.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  loadLegacy,
  type LegacyAngler,
  type LegacyCatch,
  type LegacyTrophyInfo,
  type LegacyTrophyRow,
  type LegacyTrophyStats,
} from './legacy';
import type { Angler, Catch } from '../../src/domain/types';
import { standings } from '../../src/domain/scoring';
import {
  trophyBadges,
  trophyStats,
  type TrophyEvent,
  type TrophyRow,
  type TrophyStats,
} from '../../src/domain/trophies';
import { shuffled, tournamentArb, type Tournament } from '../../src/test/arbitraries';

const legacy = loadLegacy();
const RUNS = 1_000;
const DAYS = ['2027-09-18', '2027-09-19', '2027-09-20'];
const MY_PHONE = '406-555-0100';

const eventArb = fc.record({
  tournament: tournamentArb,
  species: fc.subarray(['Walleye', 'Pike', 'Perch'], { minLength: 1 }),
  year: fc.constantFrom('2026', '2027', '2028', ''),
  // A zone the phone has never heard of reads as UTC, in both apps.
  timeZone: fc.constantFrom('America/Denver', 'UTC', 'Pacific/Auckland', 'Not/AZone'),
  // Spread the fish over several days, so the best day means something.
  hours: fc.array(fc.integer({ min: 0, max: 80 }), { minLength: 1, maxLength: 12 }),
  mine: fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 20 }),
  checkIns: fc.array(
    fc.record({
      who: fc.nat(),
      day: fc.constantFrom(...DAYS),
      out: fc.boolean(),
    }),
    { maxLength: 8 },
  ),
  bets: fc.array(
    fc.record({ title: fc.constantFrom('Smallest', 'Most fish', 'First fish'), who: fc.nat() }),
    { maxLength: 4 },
  ),
  frozen: fc.option(
    fc.record({
      species: fc.subarray(['Walleye', 'Pike', 'Perch']),
      seed: fc.nat(),
      bigFish: fc.option(fc.nat()),
      // Settled since, or settled differently: the record keeps what it kept.
      bets: fc.array(
        fc.record({ title: fc.constantFrom('Smallest', 'Biggest pike'), who: fc.nat() }),
        { maxLength: 3 },
      ),
    }),
  ),
});

interface Built {
  readonly event: TrophyEvent;
  readonly info: LegacyTrophyInfo;
  readonly legacyAnglers: LegacyAngler[];
  readonly legacyCatches: LegacyCatch[];
  readonly legacyBets: {
    kind: 'bet';
    id: string;
    eventId: string;
    title: string;
    winnerId: string | null;
  }[];
  readonly mine: string[];
}

let otherPhones = 0;

type EventInput = typeof eventArb extends fc.Arbitrary<infer T> ? T : never;

function build(k: number, e: EventInput): Built {
  const id = `e${String(k)}`;
  const pre = (s: string) => `${id}-${s}`;
  const t: Tournament = e.tournament;
  const anglers: Angler[] = t.anglers.map((a) => ({
    ...a,
    id: pre(a.id),
    teamId: a.teamId === null ? null : pre(a.teamId),
  }));
  const catches: Catch[] = t.catches.map((c, i) => ({
    ...c,
    id: pre(c.id),
    anglerId: pre(c.anglerId),
    loggedAt: c.loggedAt + (e.hours[i % e.hours.length] ?? 0) * 3_600_000,
  }));
  const mine = anglers.filter((_, i) => e.mine[i % e.mine.length] === 0).map((a) => a.id);
  const at = (who: number) => anglers[who % Math.max(1, anglers.length)];

  const checkins = new Map<string, Record<string, { in: number | null; out: number | null }>>();
  for (const c of e.checkIns) {
    const a = at(c.who);
    if (!a) continue;
    const days = checkins.get(a.id) ?? {};
    const start = Date.parse(`${c.day}T12:00:00Z`);
    days[c.day] = { in: start, out: c.out ? start + 3_600_000 : null };
    checkins.set(a.id, days);
  }
  const fullDays = mine.flatMap((a) =>
    Object.entries(checkins.get(a) ?? {})
      .filter(([, r]) => r.in !== null && r.out !== null)
      .map(([day]) => day),
  );

  const bets = e.bets.map((b, i) => ({
    id: pre(`b${String(i)}`),
    title: b.title,
    winnerId: b.who % 3 === 0 ? null : (at(b.who)?.id ?? null),
  }));

  // A frozen record that is NOT what the catches say now: rows shuffled and
  // the species changed, the way a later cleanup would leave them. The
  // trophy case has to read the record, not work it out again.
  const frozen = e.frozen
    ? {
        species: e.frozen.species,
        divisions: {
          solo: shuffled(standings('solo', catches, anglers, e.species), e.frozen.seed),
          team: shuffled(standings('team', catches, anglers, e.species), e.frozen.seed + 1),
        },
        bigFish:
          e.frozen.bigFish === null ? null : { anglerId: at(e.frozen.bigFish)?.id ?? 'nobody' },
        bets: e.frozen.bets.map((b) => ({ title: b.title, winnerId: at(b.who)?.id ?? null })),
      }
    : null;

  const event: TrophyEvent = {
    id,
    name: `Tournament ${id}`,
    year: e.year,
    timeZone: e.timeZone,
    species: e.species,
    anglers,
    catches,
    bets,
    frozen,
    fullDays,
  };
  const info: LegacyTrophyInfo = {
    name: event.name,
    year: event.year,
    targetSpecies: [...e.species],
    timeZone: e.timeZone,
    results: frozen
      ? {
          targetSpecies: [...frozen.species],
          divisions: {
            solo: frozen.divisions.solo.map((r) => ({ anglerIds: [...r.anglerIds] })),
            team: frozen.divisions.team.map((r) => ({ anglerIds: [...r.anglerIds] })),
          },
          bigFish: frozen.bigFish,
          bets: frozen.bets.map((b) => ({ title: b.title, winnerId: b.winnerId })),
        }
      : null,
  };
  // The old app keeps an entry's anglers in the order they registered: a
  // captain before a partner. The new one picks the same angler to name.
  const order = { solo: 0, captain: 0, partner: 1 };
  const legacyAnglers = [...anglers]
    .sort((a, b) => order[a.role] - order[b.role] || (a.id < b.id ? -1 : 1))
    .map((a): LegacyAngler => {
      otherPhones += 1;
      const days = checkins.get(a.id);
      return {
        id: a.id,
        name: `Name of ${a.id}`,
        handle: a.handle,
        division: a.division,
        role: a.role,
        teamId: a.teamId,
        bigfish: a.bigFish,
        disqualified: a.disqualified,
        eventId: id,
        // The old app joins your years on the phone number; nobody else shares yours.
        phone: mine.includes(a.id) ? MY_PHONE : `406${String(otherPhones).padStart(7, '0')}`,
        ...(days ? { checkins: days } : {}),
      };
    });
  const legacyCatches = catches.map((c): LegacyCatch => ({
    id: c.id,
    anglerId: c.anglerId,
    division: c.division,
    species: c.species,
    length: c.lengthInches,
    timestamp: c.loggedAt,
    status: c.status,
    eventId: id,
  }));
  const legacyBets = bets.map((b) => ({ kind: 'bet' as const, eventId: id, ...b }));
  return { event, info, legacyAnglers, legacyCatches, legacyBets, mine };
}

const rowView = (r: TrophyRow) => ({
  eventId: r.eventId,
  name: r.name,
  year: r.year,
  handle: r.handle,
  frozen: r.frozen,
  division: r.division,
  fish: r.fish,
  scoring: r.scoring,
  best: r.best,
  bestCatch: r.bestCatch?.id ?? null,
  top3: r.top3,
  bestDay: r.bestDay,
  placing: r.placing,
  entrants: r.entrants,
  disqualified: r.disqualified,
  bigFish: r.bigFish,
  bigFishWon: r.bigFishWon,
  betsWon: r.betsWon,
  fullDays: r.fullDays,
  species: r.species,
});

const legacyRowView = (r: LegacyTrophyRow) => ({
  eventId: r.eventId,
  name: r.name,
  year: r.year,
  handle: r.handle,
  frozen: r.frozen,
  division: r.division,
  fish: r.fish,
  scoring: r.scoring,
  best: r.best,
  bestCatch: r.bestCatch?.id ?? null,
  top3: r.top3,
  bestDay: r.bestDay,
  placing: r.placing,
  entrants: r.entrants,
  disqualified: r.disqualified,
  bigFish: r.bigfish,
  bigFishWon: r.bigFishWon,
  betsWon: r.betsWon,
  fullDays: r.fullDays,
  species: r.species,
});

const statsView = (s: TrophyStats | LegacyTrophyStats) => ({
  events: s.events,
  fish: s.fish,
  species: s.species,
  longest: s.longest?.id ?? null,
  best: s.best,
  bestTop3: s.bestTop3,
  bestDay: s.bestDay,
  mostInEvent: s.mostInEvent,
  fullDays: s.fullDays,
  bigFishBuyIns: s.bigFishBuyIns,
  bestPlacing: s.bestPlacing,
  wins: s.wins,
  podiums: s.podiums,
  bigFishWins: s.bigFishWins,
  betsWon: s.betsWon,
});

describe('the trophy case matches the old app', () => {
  it('bests, history and badges, across frozen and unfrozen tournaments', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { minLength: 1, maxLength: 4 }), (career) => {
        const built = career.map((e, k) => build(k, e));
        const mine = new Set(built.flatMap((b) => b.mine));
        const ours = trophyStats(
          built.map((b) => b.event),
          mine,
        );
        const infos = new Map(built.map((b) => [b.event.id, b.info]));
        const first = built.flatMap((b) => b.mine)[0];
        const theirs = legacy.trophyStats(
          built.flatMap((b) => b.legacyAnglers),
          built.flatMap((b) => b.legacyCatches),
          built.flatMap((b) => b.legacyBets),
          first === undefined ? [] : [first],
          (eventId) => {
            const info = infos.get(eventId);
            if (!info) throw new Error(`no event ${eventId}`);
            return info;
          },
        );
        expect(ours.history.map(rowView)).toEqual(theirs.history.map(legacyRowView));
        expect(statsView(ours)).toEqual(statsView(theirs));
        expect(trophyBadges(ours)).toEqual(legacy.trophyBadges(theirs));
      }),
      { numRuns: RUNS },
    );
  });
});
