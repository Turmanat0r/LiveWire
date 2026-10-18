import { describe, expect, it } from 'vitest';
import type { Angler, Catch } from '../domain/types';
import { EVENT_ID } from '../test/rows';
import type { OutboxItem } from './local';
import { buildResults, parseResults, resultsJson, resultsView } from './results';
import type { Row } from './tables';

const angler = (id: string, over: Partial<Angler> = {}): Angler => ({
  id,
  handle: `Handle ${id}`,
  division: 'solo',
  role: 'solo',
  teamId: null,
  bigFish: true,
  feePaid: true,
  disqualified: false,
  ...over,
});

const fish = (id: string, anglerId: string, inches: number, over: Partial<Catch> = {}): Catch => ({
  id,
  anglerId,
  division: 'solo',
  species: 'Walleye',
  lengthInches: inches,
  loggedAt: 1_000,
  status: 'approved',
  ...over,
});

const bet = (over: Partial<Row<'bets'>>): Row<'bets'> => ({
  id: crypto.randomUUID(),
  event_id: EVENT_ID,
  creator_angler_id: 'a',
  title: 'Smallest walleye',
  stake: 'Lunch',
  scoring: 'smallest',
  created_at: '2027-09-18T15:00:00+00:00',
  settled_at: null,
  winner_angler_id: null,
  ...over,
});

const ANGLERS = [
  angler('a'),
  angler('b'),
  angler('t1', { division: 'team', role: 'captain', teamId: 'team-1' }),
  angler('t2', { division: 'team', role: 'partner', teamId: 'team-1', bigFish: false }),
];
const CATCHES = [
  fish('c1', 'a', 21.5),
  fish('c2', 'b', 24.75),
  fish('c3', 'a', 19),
  fish('c4', 't2', 22, { division: 'team' }),
  fish('c5', 'b', 30, { status: 'pending' }),
];

describe('a frozen result', () => {
  it('writes down the standings, the Big Fish pot and the settled bets as the board shows them', () => {
    const record = buildResults(
      ANGLERS,
      CATCHES,
      ['Walleye'],
      [
        bet({ title: 'Open bet' }),
        bet({ settled_at: '2027-09-18T22:00:00+00:00', winner_angler_id: 'a' }),
      ],
    );
    expect(
      record.divisions.solo.map((p) => [p.place, p.names, p.bestInches, p.top3Inches]),
    ).toEqual([
      [1, 'Handle b', 24.75, 24.75],
      [2, 'Handle a', 21.5, 40.5],
    ]);
    // A team is one row under both its handles, the captain first.
    expect(record.divisions.team).toMatchObject([
      { place: 1, key: 'team-1', names: 'Handle t1 & Handle t2', bestInches: 22 },
    ]);
    // The pending 30″ does not count; t2 is not in the pot.
    expect(record.bigFish).toEqual({
      anglerId: 'b',
      catchId: 'c2',
      name: 'Handle b',
      inches: 24.75,
    });
    expect(record.bets).toMatchObject([
      { title: 'Smallest walleye', winnerId: 'a', winner: 'Handle a' },
    ]);
  });

  it('reads back what it wrote, and nothing it did not', () => {
    const record = buildResults(ANGLERS, CATCHES, ['Walleye'], []);
    expect(parseResults(resultsJson(record))).toEqual(record);
    expect(parseResults({ divisions: { solo: [] }, bigFish: null })).toBeNull();
    expect(parseResults('nonsense')).toBeNull();
  });

  it('shows a freeze or an unfreeze at once, before it has sent', () => {
    const record = buildResults(ANGLERS, CATCHES, ['Walleye'], []);
    const item = (
      fn: 'director_freeze_results' | 'director_unfreeze_results',
      seq: number,
    ): OutboxItem => ({
      seq,
      id: `i${String(seq)}`,
      label: fn,
      createdAt: Date.parse('2027-09-19T23:00:00Z'),
      steps: [
        {
          kind: 'call',
          fn,
          args:
            fn === 'director_freeze_results'
              ? { p_event_id: EVENT_ID, p_record: resultsJson(record) }
              : { p_event_id: EVENT_ID },
        },
      ],
      attempts: 0,
      failure: null,
    });
    expect(resultsView([], [], EVENT_ID)).toEqual({ record: null, frozenAt: null, sending: false });
    const frozen = resultsView([], [item('director_freeze_results', 1)], EVENT_ID);
    expect(frozen).toMatchObject({ frozenAt: '2027-09-19T23:00:00.000Z', sending: true });
    expect(frozen.record?.bigFish?.inches).toBe(24.75);
    const row: Row<'results'> = {
      event_id: EVENT_ID,
      record: resultsJson(record) ?? {},
      frozen_at: '2027-09-19T23:00:00+00:00',
      frozen_by: null,
    };
    expect(resultsView([row], [item('director_unfreeze_results', 2)], EVENT_ID)).toEqual({
      record: null,
      frozenAt: null,
      sending: true,
    });
  });
});
