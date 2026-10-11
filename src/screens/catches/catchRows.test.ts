import { describe, expect, it } from 'vitest';
import type { OutboxItem, Step } from '../../data/local';
import { catchRow } from '../../test/rows';
import { catchIdOf, catchRows } from './catchRows';

let seq = 0;
function item(steps: Step[], failure: OutboxItem['failure'] = null): OutboxItem {
  seq += 1;
  return { seq, id: `item-${String(seq)}`, label: 'x', createdAt: 0, steps, attempts: 0, failure };
}

const filing = (id: string, angler = 'angler-1') =>
  item([
    {
      kind: 'call',
      fn: 'file_catch',
      args: {
        p_id: id,
        p_angler_id: angler,
        p_species: 'Walleye',
        p_length_inches: 19,
        p_logged_at: '2027-09-18T16:00:00Z',
      },
    },
    { kind: 'upload', path: `e/${id}.jpg`, file: 'photo' },
  ]);

describe('my catches, server and outbox together', () => {
  it('lists the server’s catches for the angler, newest first', () => {
    const rows = catchRows(
      [
        catchRow({ id: 'old', logged_at: '2027-09-18T13:00:00Z', status: 'approved' }),
        catchRow({ id: 'new', logged_at: '2027-09-18T15:00:00Z', status: 'pending' }),
        catchRow({ id: 'theirs', angler_id: 'angler-2' }),
      ],
      [],
      'angler-1',
    );
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['new', 'pending'],
      ['old', 'approved'],
    ]);
  });

  it('shows a catch still in the outbox, waiting to send', () => {
    const waiting = filing('c9');
    const [row] = catchRows([], [waiting], 'angler-1');
    expect(row).toMatchObject({
      id: 'c9',
      status: 'waiting',
      species: 'Walleye',
      lengthInches: 19,
      waiting,
      photoSending: true,
    });
  });

  it('shows a filed catch whose photo is still sending', () => {
    const photoOnly = item([{ kind: 'upload', path: 'e/c1.jpg', file: 'photo' }]);
    const [row] = catchRows([catchRow({ id: 'c1', status: 'pending' })], [photoOnly], 'angler-1');
    expect(row?.status).toBe('pending');
    expect(row?.photoSending).toBe(true);
  });

  it('lays a new length and a withdrawal over the server’s copy', () => {
    const amend = item([
      { kind: 'call', fn: 'amend_catch_length', args: { p_id: 'c1', p_length_inches: 22.25 } },
    ]);
    const withdraw = item([
      { kind: 'remove', path: 'e/c2.jpg' },
      { kind: 'call', fn: 'withdraw_catch', args: { p_id: 'c2' } },
    ]);
    const rows = catchRows(
      [
        catchRow({ id: 'c1', status: 'pending', logged_at: '2027-09-18T15:00:00Z' }),
        catchRow({ id: 'c2', status: 'pending', logged_at: '2027-09-18T14:00:00Z' }),
      ],
      [amend, withdraw],
      'angler-1',
    );
    expect(rows[0]?.newLength).toBe(22.25);
    expect(rows[1]?.withdrawing).toBe(true);
  });

  it('carries what the server refused, with the catch it was about', () => {
    const refused = item(
      [{ kind: 'call', fn: 'amend_catch_length', args: { p_id: 'c1', p_length_inches: 30 } }],
      { key: 'catch_already_reviewed', detail: 'Already ruled on.' },
    );
    const [row] = catchRows([catchRow({ id: 'c1', status: 'approved' })], [refused], 'angler-1');
    expect(row?.refused).toEqual([refused]);
    expect(row?.newLength).toBeNull();
  });

  it('knows which catch each kind of outbox item is about', () => {
    expect(catchIdOf(filing('a'))).toBe('a');
    expect(catchIdOf(item([{ kind: 'remove', path: 'e/b.jpg' }]))).toBe('b');
    expect(catchIdOf(item([{ kind: 'call', fn: 'post_message', args: { p_catch_id: 'c' } }]))).toBe(
      'c',
    );
    expect(catchIdOf(item([{ kind: 'call', fn: 'check_in', args: {} }]))).toBeNull();
  });
});
