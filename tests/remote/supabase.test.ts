// The app's server adapter (src/data/supabase.ts) against a real Supabase:
// the things the sync engine's tests can only assume about the server. Runs
// in CI, where a local Supabase is started; skipped anywhere without one.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RemoteError, type LiveStatus, type Remote, type Signal } from '../../src/data/remote';
import { supabaseRemote } from '../../src/data/supabase';
import { TestDb } from '../db/harness';
import { registrant, setUpEvent } from '../db/fixtures';

const url = process.env['VITE_SUPABASE_URL'];
const key = process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
// Skipped on a PC with no Supabase; in CI, where one is always started, a
// missing server fails these rather than quietly skipping them.
const running = Boolean(url && key && process.env['SUPABASE_DB_URL']) || Boolean(process.env['CI']);

function phone(): Remote {
  return supabaseRemote({ url: url ?? '', key: key ?? '' });
}

async function failureOf(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof RemoteError))
    throw new Error(`Expected a RemoteError, got ${String(error)}`);
  return error.failure;
}

/** Listens until the status settles on live or lost. */
async function join(remote: Remote, topics: string[]) {
  const signals: Signal[] = [];
  let status: LiveStatus = 'joining';
  const stop = remote.listen(
    topics,
    (s) => signals.push(s),
    (s) => {
      status = s;
    },
  );
  await vi.waitFor(
    () => {
      expect(status).not.toBe('joining');
    },
    { timeout: 20_000, interval: 100 },
  );
  return { signals, status: () => status, stop };
}

describe.skipIf(!running)('the app’s server adapter, on a real Supabase', () => {
  let db: TestDb;
  let eventId: string;
  let device: Remote;
  let anglerId: string;

  beforeAll(async () => {
    db = await TestDb.open();
    ({ eventId } = await setUpEvent(db));
    device = phone();
    const angler = registrant();
    anglerId = angler.id;
    await device.signIn();
    await device.call('register_entry', {
      p_entry_id: randomUUID(),
      p_event_id: eventId,
      p_division: 'solo',
      p_captain: { ...angler },
    });
  });
  afterAll(async () => {
    await db.close();
  });

  async function fileCatch(remote: Remote): Promise<string> {
    const id = randomUUID();
    await remote.call('file_catch', {
      p_id: id,
      p_angler_id: anglerId,
      p_species: 'Walleye',
      p_length_inches: 20,
      p_logged_at: new Date().toISOString(),
    });
    return id;
  }

  it('signs a phone in once, however many ask at the same moment', async () => {
    const fresh = phone();
    const ids = await Promise.all([fresh.signIn(), fresh.signIn(), fresh.signIn()]);
    expect(new Set(ids).size).toBe(1);
    expect(await fresh.signIn()).toBe(ids[0]);
  });

  it('reads only what the phone may see', async () => {
    const pendingId = await fileCatch(device);
    const stranger = phone();
    await stranger.signIn();
    const theirs = await stranger.readTable('catches', eventId);
    const mine = await device.readTable('catches', eventId);
    expect(mine.map((c) => c.id)).toContain(pendingId);
    expect(theirs.map((c) => c.id)).not.toContain(pendingId);
    expect((await stranger.readTable('events', null)).map((e) => e.id)).toContain(eventId);
  });

  it('passes on a refusal with the database’s key and words', async () => {
    const stranger = phone();
    await stranger.signIn();
    const failure = await failureOf(fileCatch(stranger));
    expect(failure).toMatchObject({ kind: 'refused', key: 'not_your_entry' });
    expect(failure.kind === 'refused' && failure.detail.length > 0).toBe(true);
  });

  it('counts a photo sent twice as stored once', async () => {
    const catchId = await fileCatch(device);
    const path = `${eventId}/${catchId}.jpg`;
    const file = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer, type: 'image/jpeg' };
    await device.upload(path, file);
    await device.upload(path, file);
    const stored = await db.admin(
      `select name from storage.objects where bucket_id = 'catch-photos' and name = $1`,
      [path],
    );
    expect(stored).toHaveLength(1);
  });

  it('hears a signal when a row on the event changes', async () => {
    const listener = await join(device, [`event:${eventId}`]);
    expect(listener.status()).toBe('live');
    const heard = (id: string) =>
      listener.signals.some((s) => s.table === 'catches' && s.key['id'] === id);

    // Supabase starts relaying a few seconds after the first phone joins (the
    // app reads everything again then, to cover the gap). Keep changing
    // things until the relay is running...
    const filed: string[] = [];
    const deadline = Date.now() + 30_000;
    while (!filed.some(heard)) {
      if (Date.now() > deadline) throw new Error('No signal arrived within 30 seconds');
      filed.push(await fileCatch(device));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // ...and from then on, every change is announced.
    const catchId = await fileCatch(device);
    await vi.waitFor(
      () => {
        expect(heard(catchId)).toBe(true);
      },
      { timeout: 10_000, interval: 100 },
    );
    listener.stop();
  });

  it('cannot listen on a topic outside the tournament', async () => {
    const listener = await join(device, ['director-only']);
    expect(listener.status()).toBe('lost');
    listener.stop();
  });

  it('cannot listen at all before signing in', async () => {
    const listener = await join(phone(), [`event:${eventId}`]);
    expect(listener.status()).toBe('lost');
    listener.stop();
  });

  it('calls a server that cannot be reached "no signal"', async () => {
    const nowhere = supabaseRemote({ url: 'http://127.0.0.1:9', key: key ?? '' });
    expect(await failureOf(nowhere.signIn())).toEqual({ kind: 'offline' });
  });
});
