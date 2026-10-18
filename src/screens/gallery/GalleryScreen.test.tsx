import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { galleryRows, photoFileName } from '../../data/gallery';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { catchRow, entryRows, EVENT_ID, eventRow, OTHER_EVENT_ID } from '../../test/rows';
import { testSync } from '../../test/sync';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function field() {
  const server = new FakeServer();
  server.put('events', eventRow());
  const me = entryRows({ userId: 'device-1', names: ['Daniel Turman'] });
  const them = entryRows({ number: 2, userId: 'device-9', names: ['Pat Morgan'] });
  const dq = entryRows({ number: 3, userId: 'device-8', names: ['Gone Fishing'] });
  putEntry(server, me);
  putEntry(server, them);
  putEntry(server, dq);
  const [theirs] = them.anglers;
  const [gone] = dq.anglers;
  if (!theirs || !gone) throw new Error('the other anglers');
  server.put('anglers', { ...theirs, handle: 'Soggy Granite Walleye' });
  server.put('anglers', { ...gone, handle: 'Disqualified Dace', disqualified: true });
  const fish = (id: string, anglerId: string, inches: number, at: string, over = {}) => {
    server.put(
      'catches',
      catchRow({ id, angler_id: anglerId, length_inches: inches, logged_at: at, ...over }),
    );
  };
  fish('mine-old', me.captainId, 19.5, '2027-09-18T14:00:00Z');
  fish('mine-new', me.captainId, 22, '2027-09-18T16:00:00Z');
  fish('theirs', them.captainId, 24.75, '2027-09-18T17:00:00Z');
  fish('pending', them.captainId, 30, '2027-09-18T18:00:00Z', { status: 'pending' });
  fish('dq', dq.captainId, 28, '2027-09-18T15:00:00Z');
  fish('elsewhere', them.captainId, 31, '2027-09-18T15:00:00Z', { event_id: OTHER_EVENT_ID });
  return server;
}

async function open(server: FakeServer, path = '/gallery') {
  const sync = testSync(server);
  const router = renderApp(path, sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, router, user: userEvent.setup() };
}

const tiles = () =>
  within(screen.getByRole('list', { name: 'Approved fish' }))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));

describe('the fish gallery', () => {
  it('shows approved fish only, yours first and then the newest, never a disqualified angler’s', async () => {
    await open(field());
    expect(
      screen.getByText('3 approved fish, yours first. Tap one to see it full size.'),
    ).toBeTruthy();
    expect(tiles()).toEqual([
      'Salty Bedrock Perch, 22.00″ Walleye, yours',
      'Salty Bedrock Perch, 19.50″ Walleye, yours',
      'Soggy Granite Walleye, 24.75″ Walleye',
    ]);
  });

  it('opens a fish full size, walks the wall, and saves only your own', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(new Blob(['jpeg'], { type: 'image/jpeg' })))),
    );
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    const { router, user } = await open(field());
    await user.click(screen.getByRole('button', { name: /^Soggy Granite Walleye/ }));
    expect(router.state.location.search).toBe('?photo=theirs');
    const viewer = screen.getByRole('dialog', { name: 'Soggy Granite Walleye · 24.75″ Walleye' });
    // Not yours: nothing to save.
    expect(within(viewer).queryByRole('button', { name: 'Save photo' })).toBeNull();

    await user.click(within(viewer).getByRole('button', { name: 'Previous fish' }));
    const mine = screen.getByRole('dialog', { name: 'Salty Bedrock Perch · 19.50″ Walleye' });
    await user.click(within(mine).getByRole('button', { name: 'Save photo' }));
    await act(settle);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('MKWO-Walleye-19.50in.jpg');
    expect(within(mine).getByRole('button', { name: 'Saved' })).toBeTruthy();

    // Close takes back the history entry the photo opened, so Back and Close agree.
    await user.click(within(mine).getByRole('button', { name: 'Close' }));
    await act(settle);
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says so when nothing has been approved yet', async () => {
    const server = new FakeServer();
    server.put('events', eventRow());
    await open(server);
    expect(
      screen.getByText('Nothing approved yet. Every fish the director approves shows up here.'),
    ).toBeTruthy();
  });
});

describe('gallery rules', () => {
  it('keeps to the event, and names a saved photo so it can be found again', () => {
    expect(galleryRows([catchRow({ event_id: OTHER_EVENT_ID })], [], EVENT_ID, new Set())).toEqual(
      [],
    );
    expect(photoFileName('MKWO', 'Northern Pike', 31.25)).toBe('MKWO-Northern-Pike-31.25in.jpg');
    expect(photoFileName('', 'Walleye', 20)).toBe('LiveWire-Walleye-20.00in.jpg');
  });
});
