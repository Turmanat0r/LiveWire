import { describe, expect, it } from 'vitest';
import type { Angler, Catch } from '../domain/types';
import { EVENT_ID } from '../test/rows';
import type { OutboxItem, Step } from './local';
import { betViews, newBetProblem } from './sideBets';
import type { Row } from './tables';

const at = (minute: number) => new Date(Date.UTC(2027, 8, 18, 16, minute)).toISOString();

function bet(id: string, minute: number, over: Partial<Row<'bets'>> = {}): Row<'bets'> {
  return {
    id,
    event_id: EVENT_ID,
    creator_angler_id: 'a',
    title: `Bet ${id}`,
    stake: '',
    scoring: 'smallest',
    winner_angler_id: null,
    settled_at: null,
    created_at: at(minute),
    ...over,
  };
}

let seq = 0;
function item(steps: Step[], failure: OutboxItem['failure'] = null): OutboxItem {
  seq += 1;
  return { seq, id: `i${String(seq)}`, label: 'x', createdAt: 0, attempts: 0, failure, steps };
}

const angler = (id: string): Angler => ({
  id,
  handle: id,
  division: 'solo',
  role: 'solo',
  teamId: null,
  bigFish: false,
  feePaid: false,
  disqualified: false,
});
const fish = (anglerId: string, inches: number, minute: number): Catch => ({
  id: `${anglerId}-${String(minute)}`,
  anglerId,
  division: 'solo',
  species: 'Walleye',
  lengthInches: inches,
  loggedAt: Date.parse(at(minute)),
  status: 'approved',
});

const view = (
  bets: Row<'bets'>[],
  entries: Row<'bet_entries'>[] = [],
  items: OutboxItem[] = [],
  catches: Catch[] = [],
) => betViews(bets, entries, items, EVENT_ID, [angler('a'), angler('b')], catches, ['Walleye']);

const entry = (betId: string, anglerId: string): Row<'bet_entries'> => ({
  bet_id: betId,
  angler_id: anglerId,
  event_id: EVENT_ID,
  joined_at: at(0),
});

describe('side bets on screen', () => {
  it('lists open bets newest first, then settled ones, and names who leads', () => {
    const views = view(
      [bet('old', 1), bet('new', 5), bet('done', 9, { winner_angler_id: 'a' })],
      [entry('old', 'a'), entry('old', 'b')],
      [],
      [fish('a', 18, 2), fish('b', 15.5, 3)],
    );
    expect(views.map((v) => v.bet.id)).toEqual(['new', 'old', 'done']);
    expect(views[1]?.leader).toEqual({ scoring: 'smallest', anglerId: 'b', lengthInches: 15.5 });
  });

  it('shows a bet started with no signal, with its starter already in', () => {
    const [started] = view(
      [],
      [],
      [
        item([
          {
            kind: 'call',
            fn: 'create_bet',
            args: { p_id: 'b9', p_angler_id: 'a', p_title: 'First fish', p_scoring: 'first' },
          },
          { kind: 'call', fn: 'join_bet', args: { p_bet_id: 'b9', p_angler_id: 'a' } },
        ]),
      ],
    );
    expect(started).toMatchObject({ entrants: ['a'], sending: true });
    expect(started?.bet).toMatchObject({ title: 'First fish', scoring: 'first' });
  });

  it('lays a join, a leave, a call and a delete over the server’s copy', () => {
    const views = view(
      [bet('x', 1), bet('y', 2), bet('z', 3)],
      [entry('x', 'a'), entry('y', 'a'), entry('y', 'b')],
      [
        item([{ kind: 'call', fn: 'join_bet', args: { p_bet_id: 'x', p_angler_id: 'b' } }]),
        item([{ kind: 'call', fn: 'leave_bet', args: { p_bet_id: 'y', p_angler_id: 'b' } }]),
        item([
          { kind: 'call', fn: 'settle_bet', args: { p_bet_id: 'x', p_winner_angler_id: 'b' } },
        ]),
        item([{ kind: 'call', fn: 'delete_bet', args: { p_bet_id: 'z' } }]),
      ],
    );
    const byId = new Map(views.map((v) => [v.bet.id, v]));
    expect(byId.get('x')?.entrants).toEqual(['a', 'b']);
    expect(byId.get('x')?.bet.winner_angler_id).toBe('b');
    expect(byId.get('y')?.entrants).toEqual(['a']);
    expect(byId.has('z')).toBe(false);
  });

  it('carries what the server refused with the bet it was about', () => {
    const refused = item(
      [{ kind: 'call', fn: 'join_bet', args: { p_bet_id: 'x', p_angler_id: 'b' } }],
      { key: 'bet_settled', detail: 'That side bet has already been called.' },
    );
    const [x] = view([bet('x', 1)], [], [refused]);
    expect(x?.refused).toEqual([refused]);
    expect(x?.entrants).toEqual([]);
  });

  it('checks a new bet before it is sent', () => {
    const open = view([bet('1', 1), bet('2', 2), bet('3', 3, { title: 'Smallest pike' })]);
    expect(newBetProblem('  ', '', open, 'b')).toBe('Say what the bet is.');
    expect(newBetProblem('x'.repeat(71), '', open, 'b')).toMatch(/under 70/);
    expect(newBetProblem('smallest PIKE', '', open, 'b')).toBe(
      'There is already an open bet with that name.',
    );
    expect(newBetProblem('Another', '', open, 'a')).toMatch(/already have 3 bets running/);
    expect(newBetProblem('Another', 'A beer', open, 'b')).toBeNull();
  });
});
