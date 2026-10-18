import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { galleryRows, photoFileName } from '../../data/gallery';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { catchRow, dayRow, entryRows, EVENT_ID, eventRow, OTHER_EVENT_ID } from '../../test/rows';
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

/** A recorder that hands back one small piece of video when stopped. */
class FakeRecorder {
  static isTypeSupported = (mime: string) => mime === 'video/mp4';
  readonly mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? '';
  }
  recording = false;
  start() {
    this.recording = true;
  }
  stop() {
    this.ondataavailable?.({ data: new Blob(['video'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

/** Pretends the browser can draw and record, and that time flies. */
function canRecord() {
  const painted: string[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    textAlign: 'left',
    fillRect: () => undefined,
    drawImage: () => undefined,
    fillText: (text: string) => painted.push(text),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as never);
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    configurable: true,
    value: () => ({ getTracks: () => [{ stop: () => undefined }] }),
  });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  // Each frame is 0.7 seconds after the last, whoever else reads the clock.
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((step) =>
    window.setTimeout(() => {
      now += 700;
      step(now);
    }, 0),
  );
  return painted;
}

describe('the highlight reel', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'captureStream');
  });

  it('makes a video of your own fish only, biggest first, and saves it by name', async () => {
    const painted = canRecord();
    const fetched = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(new Response(new Blob(['jpeg'], { type: 'image/jpeg' }))),
    );
    vi.stubGlobal('fetch', fetched);
    URL.createObjectURL = vi.fn(() => 'blob:reel');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const server = field();
    server.put('event_days', dayRow('2027-09-18'));
    const { user } = await open(server);

    const card = screen.getByRole('heading', { name: 'Highlight reel' }).closest('section');
    if (!card) throw new Error('no reel card');
    expect(card.textContent).toContain(
      'Your 2 best fish, biggest first, as an 8-second vertical video to post.',
    );
    await user.click(within(card).getByRole('button', { name: 'Make my highlight reel' }));
    await within(card).findByText(/^Done:/);
    // Theirs never: only your two, the 22″ first.
    expect(fetched.mock.calls.map(([url]) => url)).toEqual([
      `https://photos.test/${EVENT_ID}/mine-new.jpg`,
      `https://photos.test/${EVENT_ID}/mine-old.jpg`,
    ]);
    expect(painted).toContain('Montana Kayak Walleye Open');
    expect(painted).toContain('22.00″');
    expect(painted).not.toContain('24.75″');
    expect(within(card).getByLabelText('Your highlight reel').getAttribute('src')).toBe(
      'blob:reel',
    );
    await user.click(within(card).getByRole('button', { name: 'Download' }));
    const anchor = click.mock.contexts.at(-1) as HTMLAnchorElement;
    expect(anchor.download).toBe('MKWO-2027-Salty-Bedrock-Perch-highlights.mp4');
  });

  it('says so when the browser cannot record', async () => {
    await open(field());
    expect(screen.getByText(/This browser cannot record video\./)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Make my highlight reel' }).disabled,
    ).toBe(true);
  });

  it('is not there for a phone with no approved fish of its own', async () => {
    const server = new FakeServer();
    server.put('events', eventRow());
    const them = entryRows({ userId: 'device-9' });
    putEntry(server, them);
    server.put('catches', catchRow({ id: 'theirs', angler_id: them.captainId }));
    await open(server);
    expect(screen.getByRole('list', { name: 'Approved fish' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Highlight reel' })).toBeNull();
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
