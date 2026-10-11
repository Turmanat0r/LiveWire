import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Json } from '../data/remote';
import type { Row } from '../data/tables';
import { FakeServer, settle } from '../test/fakes';
import { putEntry, renderApp } from '../test/render';
import { dayRow, entryRows, EVENT_ID, eventRow } from '../test/rows';
import { testSync } from '../test/sync';

function serverWithEntry(team = false) {
  const server = new FakeServer();
  server.put('events', eventRow());
  server.put('event_days', dayRow('2027-09-18'));
  server.put('event_days', dayRow('2027-09-19'));
  const rows = entryRows({ team });
  putEntry(server, rows);
  return { server, rows };
}

/** The server's side of check_in: the first time stands. */
function acceptCheckIns(server: FakeServer) {
  const text = (value: Json | undefined) => (typeof value === 'string' ? value : '');
  server.answers.set('check_in', (args: Readonly<Record<string, Json>>) => {
    const row: Row<'check_ins'> = {
      angler_id: text(args['p_angler_id']),
      event_id: EVENT_ID,
      day: text(args['p_day']),
      in_at: text(args['p_at']),
      out_at: null,
      updated_at: text(args['p_at']),
      updated_by: null,
    };
    server.put('check_ins', row);
    return null;
  });
}

async function open(server: FakeServer) {
  const sync = testSync(server);
  renderApp('/check-in', sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

const dayRows = () =>
  within(screen.getByRole('list', { name: 'Fishing days' })).getAllByRole('listitem');

describe('checking in and out', () => {
  it('asks for a registration first', async () => {
    const server = new FakeServer();
    server.put('events', eventRow());
    await open(server);
    expect(screen.getByText('Register an angler first to check in.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Register' })).toBeTruthy();
  });

  it('shows each fishing day, with the event’s hours', async () => {
    const { server } = serverWithEntry();
    await open(server);
    expect(screen.getByText(/Lines in 7:00 AM, lines out 2:00 PM/)).toBeTruthy();
    expect(dayRows().map((r) => r.textContent)).toEqual([
      'Day 1 · Sat, Sep 18Not checked inCheck in',
      'Day 2 · Sun, Sep 19Not checked inCheck in',
    ]);
  });

  it('records a check-in with no signal, and says it is waiting to send', async () => {
    const { server, rows } = serverWithEntry();
    const { sync, user } = await open(server);
    server.online = false;
    const [day1] = dayRows();
    if (!day1) throw new Error('no day rows');
    await user.click(within(day1).getByRole('button', { name: 'Check in' }));
    await act(settle);

    expect(within(day1).getByText(/^Checked in at .* · waiting to send$/)).toBeTruthy();
    expect(within(day1).getByRole('button', { name: 'Check out' })).toBeTruthy();
    const [item] = sync.getState().outbox.items;
    expect(item?.steps[0]).toMatchObject({
      kind: 'call',
      fn: 'check_in',
      args: { p_angler_id: rows.captainId, p_day: '2027-09-18' },
    });
  });

  it('shows the server’s record once it has it', async () => {
    const { server } = serverWithEntry();
    acceptCheckIns(server);
    const { sync, user } = await open(server);
    const [day1] = dayRows();
    if (!day1) throw new Error('no day rows');
    await user.click(within(day1).getByRole('button', { name: 'Check in' }));
    await act(async () => {
      await sync.settled();
      await sync.refresh(['check_ins']);
    });

    expect(sync.getState().outbox.items).toEqual([]);
    expect(within(day1).getByText(/^Checked in at \d+:\d\d [AP]M$/)).toBeTruthy();
  });

  it('lets a team’s phone check either angler in', async () => {
    const { server } = serverWithEntry(true);
    await open(server);
    const pick = screen.getByLabelText('Angler');
    expect(
      within(pick)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Daniel Turman (Salty Bedrock Perch)', 'Pat Partner (Soggy Granite Walleye)']);
  });
});
