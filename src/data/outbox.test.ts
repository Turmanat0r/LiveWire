import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MemoryStore, openLocal, type LocalStore, type NewOutboxItem } from './local';
import { Outbox } from './outbox';
import { RemoteError } from './remote';
import { FakeServer, ManualTimers, refusal, settle } from '../test/fakes';

const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff]).buffer, type: 'image/jpeg' };

function catchItem(id: string, label = 'Walleye, 21.5 in'): NewOutboxItem {
  return {
    id,
    label,
    createdAt: 0,
    steps: [
      { kind: 'call', fn: 'file_catch', args: { p_id: id, p_length_inches: 21.5 } },
      { kind: 'upload', path: `event/${id}.jpg`, file: 'photo' },
    ],
  };
}

function amendItem(id: string, inches: number): NewOutboxItem {
  return {
    id: `${id}-amend`,
    label: `Length now ${String(inches)} in`,
    createdAt: 0,
    steps: [
      { kind: 'call', fn: 'amend_catch_length', args: { p_id: id, p_length_inches: inches } },
    ],
  };
}

/** A lock shared like the browser's, between outboxes in one test. */
function sharedLock() {
  let held: Promise<void> = Promise.resolve();
  return (send: () => Promise<void>) => {
    const run = held.then(send);
    held = run.catch(() => undefined);
    return run;
  };
}

function setUp(local: LocalStore = new MemoryStore()) {
  const server = new FakeServer();
  const timers = new ManualTimers();
  const outbox = new Outbox({
    local: Promise.resolve(local),
    remote: server,
    random: () => 0.5,
    setTimer: timers.setTimer,
    exclusive: sharedLock(),
  });
  return { server, timers, outbox, local };
}

describe('the outbox', () => {
  it('sends each step in order, then lets the item go', async () => {
    const { server, outbox } = setUp();
    await outbox.add(catchItem('c1'), { photo });
    await outbox.settled();

    expect(server.calls.map((c) => c.fn)).toEqual(['file_catch']);
    expect([...server.uploads.keys()]).toEqual(['event/c1.jpg']);
    expect(outbox.getState().items).toEqual([]);
  });

  it('keeps everything with no signal, and sends it when signal returns', async () => {
    const { server, timers, outbox } = setUp();
    server.online = false;
    await outbox.add(catchItem('c1'), { photo });
    await outbox.add(amendItem('c1', 22));
    await outbox.settled();

    expect(outbox.getState().items.map((i) => i.label)).toEqual([
      'Walleye, 21.5 in',
      'Length now 22 in',
    ]);
    expect(outbox.getState().paused).toEqual({ kind: 'offline' });

    server.online = true;
    outbox.kick();
    await outbox.settled();
    await timers.advance(0);
    expect(server.calls.map((c) => c.fn)).toEqual(['file_catch', 'amend_catch_length']);
    expect(outbox.getState().items).toEqual([]);
    expect(outbox.getState().paused).toBeNull();
  });

  it('waits longer after each failed try, up to a minute', async () => {
    const { server, timers, outbox } = setUp();
    server.online = false;
    await outbox.add(catchItem('c1'), { photo });
    await outbox.settled();

    const waits: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const [wait = 0] = timers.waits();
      waits.push(wait);
      await timers.advance(wait);
      await outbox.settled();
    }
    expect(waits).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(outbox.getState().items[0]?.attempts).toBe(8);
  });

  it('never lets a later item overtake one still waiting', async () => {
    const { server, outbox } = setUp();
    server.answers.set('file_catch', () => {
      // The server has it, but the answer is lost on the way back.
      throw new RemoteError({ kind: 'offline' });
    });
    await outbox.add(catchItem('c1'), { photo });
    await outbox.add(amendItem('c1', 22));
    await outbox.settled();

    // Adding the correction prompted another try of the filing; the photo and
    // the correction behind it still wait.
    expect(server.calls.map((c) => c.fn)).toEqual(['file_catch', 'file_catch']);
    expect(server.uploads.size).toBe(0);

    server.answers.delete('file_catch');
    outbox.kick();
    await outbox.settled();
    // Sent again, safely (the server files a catch id once), then the rest in order.
    expect(server.calls.map((c) => c.fn)).toEqual([
      'file_catch',
      'file_catch',
      'file_catch',
      'amend_catch_length',
    ]);
    expect(server.uploads.has('event/c1.jpg')).toBe(true);
  });

  it('sets a refused item aside with the reason, and sends the rest', async () => {
    const { server, outbox } = setUp();
    server.answers.set('file_catch', () => {
      throw refusal('event_closed', 'This event is closed to new catches.');
    });
    await outbox.add(catchItem('c1'), { photo });
    await outbox.add(amendItem('c2', 18));
    await outbox.settled();

    const [refused, ...rest] = outbox.getState().items;
    expect(refused?.failure).toEqual({
      key: 'event_closed',
      detail: 'This event is closed to new catches.',
    });
    // Nothing after the refused step was tried.
    expect(server.uploads.size).toBe(0);
    expect(rest).toEqual([]);
    expect(server.calls.map((c) => c.fn)).toEqual(['file_catch', 'amend_catch_length']);

    if (refused) await outbox.discard(refused);
    expect(outbox.getState().items).toEqual([]);
  });

  it('counts a refusal that means "already done" as done', async () => {
    const { server, outbox } = setUp();
    server.answers.set('withdraw_catch', () => {
      throw refusal('catch_not_found');
    });
    await outbox.add({
      id: 'w1',
      label: 'Withdraw',
      createdAt: 0,
      steps: [
        {
          kind: 'call',
          fn: 'withdraw_catch',
          args: { p_id: 'c1' },
          alreadyDone: ['catch_not_found'],
        },
      ],
    });
    await outbox.settled();
    expect(outbox.getState().items).toEqual([]);
  });

  it('refuses to send a photo the phone no longer has', async () => {
    const { outbox } = setUp();
    await outbox.add(catchItem('c1')); // No photo kept.
    await outbox.settled();
    expect(outbox.getState().items[0]?.failure?.key).toBe('file_missing');
  });

  it('carries on after the app is closed and reopened', async () => {
    const name = `outbox-${crypto.randomUUID()}`;
    const first = setUp(await openLocal(name));
    first.server.online = false;
    await first.outbox.add(catchItem('c1'), { photo });
    await first.outbox.settled();

    const reopened = setUp(await openLocal(name));
    await reopened.outbox.load();
    expect(reopened.outbox.getState().items.map((i) => i.id)).toEqual(['c1']);
    reopened.outbox.kick();
    await reopened.outbox.settled();
    expect(reopened.server.uploads.get('event/c1.jpg')?.type).toBe('image/jpeg');
    expect(reopened.outbox.getState().items).toEqual([]);
  });

  it('sends each item once when two tabs are open', async () => {
    const local = new MemoryStore();
    const server = new FakeServer();
    const lock = sharedLock();
    const tab = () =>
      new Outbox({ local: Promise.resolve(local), remote: server, exclusive: lock });
    const [a, b] = [tab(), tab()];
    server.online = false;
    await a.add(catchItem('c1'), { photo });
    await a.add(catchItem('c2'), { photo });
    await settle();
    server.online = true;

    a.kick();
    b.kick();
    await Promise.all([a.settled(), b.settled()]);
    expect(server.calls.map((c) => c.args['p_id'])).toEqual(['c1', 'c2']);
  });
});
