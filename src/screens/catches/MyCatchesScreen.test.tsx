import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { catchRow, entryRows, EVENT_ID, eventRow } from '../../test/rows';
import { testSync } from '../../test/sync';

function serverWithCatches() {
  const server = new FakeServer();
  server.put('events', eventRow());
  server.put('event_species', {
    event_id: EVENT_ID,
    name: 'Walleye',
    record_inches: 36,
    position: 0,
  });
  const rows = entryRows();
  putEntry(server, rows);
  const mine = (id: string, over: Parameters<typeof catchRow>[0]) => {
    server.put('catches', catchRow({ id, angler_id: rows.captainId, ...over }));
  };
  return { server, rows, mine };
}

async function open(server: FakeServer, path: string) {
  const sync = testSync(server);
  renderApp(path, sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

const cards = () =>
  screen.getAllByRole('listitem').filter((li) => li.className.includes('catch-card'));

describe('my catches', () => {
  it('lets a pending catch be fixed or withdrawn, and locks a ruled one', async () => {
    const { server, mine } = serverWithCatches();
    mine('p1', { status: 'pending', length_inches: 20, logged_at: '2027-09-18T15:00:00Z' });
    mine('a1', { status: 'approved', length_inches: 24, logged_at: '2027-09-18T14:00:00Z' });
    await open(server, '/my-catches');
    const [pending, approved] = cards();
    if (!pending || !approved) throw new Error('two cards expected');
    expect(within(pending).getByText('Pending review')).toBeTruthy();
    expect(within(pending).getByRole('button', { name: 'Withdraw' })).toBeTruthy();
    expect(within(approved).getByText('Approved')).toBeTruthy();
    expect(within(approved).getByText('Locked: the director has ruled on it.')).toBeTruthy();
    expect(within(approved).queryByRole('button')).toBeNull();
  });

  it('sends a new length, and shows it while it waits', async () => {
    const { server, mine } = serverWithCatches();
    mine('p1', { status: 'pending', length_inches: 20 });
    const { sync, user } = await open(server, '/my-catches');
    server.online = false;
    const [card] = cards();
    if (!card) throw new Error('a card expected');
    const input = within(card).getByLabelText('Length in inches');
    await user.clear(input);
    await user.type(input, '20.75');
    await user.click(within(card).getByRole('button', { name: 'Save length' }));
    await act(settle);
    expect(sync.getState().outbox.items[0]?.steps[0]).toMatchObject({
      fn: 'amend_catch_length',
      args: { p_id: 'p1', p_length_inches: 20.75 },
    });
    expect(within(card).getByText('20.75″')).toBeTruthy();
    expect(within(card).getByText(/Length changing to 20.75″/)).toBeTruthy();
  });

  it('withdraws the photo first, then the catch', async () => {
    const { server, mine } = serverWithCatches();
    mine('p1', { status: 'pending', photo_path: `${EVENT_ID}/p1.jpg` });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { sync, user } = await open(server, '/my-catches');
    server.online = false;
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    await act(settle);
    expect(sync.getState().outbox.items[0]?.steps).toEqual([
      { kind: 'remove', path: `${EVENT_ID}/p1.jpg` },
      {
        kind: 'call',
        fn: 'withdraw_catch',
        args: { p_id: 'p1' },
        alreadyDone: ['catch_not_found'],
      },
    ]);
    expect(screen.getByText('Withdrawing: waiting to send.')).toBeTruthy();
  });

  it('lets a catch that has not been sent be cancelled', async () => {
    const { server, rows } = serverWithCatches();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { sync, user } = await open(server, '/my-catches');
    server.online = false;
    await act(async () => {
      await sync.queue({
        id: 'c9',
        label: 'Walleye, 19 in',
        createdAt: 0,
        steps: [
          {
            kind: 'call',
            fn: 'file_catch',
            args: {
              p_id: 'c9',
              p_angler_id: rows.captainId,
              p_species: 'Walleye',
              p_length_inches: 19,
            },
          },
        ],
      });
      await settle();
    });
    expect(screen.getByText('Waiting to send')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel this catch' }));
    await act(settle);
    expect(sync.getState().outbox.items).toEqual([]);
    expect(screen.getByText('No catches submitted yet.')).toBeTruthy();
  });
});

describe('the livewell', () => {
  it('lists the scoring fish longest first, and marks the one that counts', async () => {
    const { server, mine } = serverWithCatches();
    mine('big-pending', { status: 'pending', length_inches: 26 });
    mine('approved', { status: 'approved', length_inches: 22 });
    mine('small', { status: 'approved', length_inches: 15 });
    mine('other', { status: 'approved', length_inches: 30, species: 'Other' });
    await open(server, '/livewell');
    const lengths = cards().map((c) => within(c).getByText(/″$/).textContent);
    expect(lengths).toEqual(['26″', '22″', '15″']);
    const counting = cards()[1];
    if (!counting) throw new Error('three cards expected');
    expect(within(counting).getByText('Currently counts')).toBeTruthy();
    expect(screen.getByText('3 filed · 2 approved')).toBeTruthy();
  });
});
