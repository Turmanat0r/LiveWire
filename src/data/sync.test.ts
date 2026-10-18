import { describe, expect, it } from 'vitest';
import { MemoryStore, type LocalStore } from './local';
import { Sync } from './sync';
import { FakeServer, ManualTimers, settle } from '../test/fakes';
import { catchRow, checkInRow, dayRow, EVENT_ID, eventRow, OTHER_EVENT_ID } from '../test/rows';

const TOPIC = `event:${EVENT_ID}`;

function setUp(local: LocalStore = new MemoryStore()) {
  const server = new FakeServer();
  const timers = new ManualTimers();
  const sync = new Sync({
    remote: server,
    local: Promise.resolve(local),
    schema: 'v1',
    now: () => timers.now,
    online: () => server.online,
    random: () => 0.5,
    setTimer: timers.setTimer,
    exclusive: (send) => send(),
  });
  server.phoneClock = () => timers.now;
  server.put('events', eventRow());
  server.put('event_days', dayRow('2027-09-18'));
  server.put('event_days', dayRow('2027-09-19'));
  return { server, timers, sync, local };
}

/** Started, listening, and caught up, including the second look after joining. */
async function live(setup: ReturnType<typeof setUp>) {
  await setup.sync.start();
  setup.server.status('live');
  await settle();
  await setup.timers.advance(5000);
  await setup.sync.settled();
  setup.server.reads.length = 0;
}

const catchIds = (sync: Sync) => [...sync.getState().tables.catches.values()].map((c) => c.id);

describe('the sync engine', () => {
  it('opens with the copy saved last time, before there is any signal', async () => {
    const local = new MemoryStore();
    await local.saveSnapshot({
      schema: 'v1',
      eventId: EVENT_ID,
      tables: { events: [eventRow()], catches: [catchRow({ id: 'c1' })] },
      savedAt: 5,
    });
    const { server, sync } = setUp(local);
    server.online = false;
    await sync.start();

    const state = sync.getState();
    expect(state.loaded).toBe(true);
    expect(state.event?.name).toBe('Montana Kayak Walleye Open');
    expect(catchIds(sync)).toEqual(['c1']);
    expect(state.connection).toBe('offline');
    expect(state.syncedAt).toBe(5);
    expect(server.signIns).toBe(0);
  });

  it('does not use a copy saved by a version of the app with another database', async () => {
    const local = new MemoryStore();
    await local.saveSnapshot({
      schema: 'v0',
      eventId: EVENT_ID,
      tables: { events: [eventRow()] },
      savedAt: 5,
    });
    const { server, sync } = setUp(local);
    server.online = false;
    await sync.start();
    expect(sync.getState().event).toBeNull();
    expect(sync.getState().syncedAt).toBeNull();
  });

  it('signs the phone in, listens on the event, and reads the event', async () => {
    const setup = setUp();
    setup.server.put('catches', catchRow({ id: 'c1' }));
    await setup.sync.start();

    expect(setup.server.signIns).toBe(1);
    expect(setup.server.listening()).toEqual(['events', TOPIC]);
    expect(setup.sync.getState().connection).toBe('connecting');
    expect(catchIds(setup.sync)).toEqual(['c1']);
    expect([...setup.sync.getState().tables.event_days.keys()]).toHaveLength(2);

    setup.server.status('live');
    await settle();
    expect(setup.sync.getState().connection).toBe('live');
  });

  it('reads again once listening starts, for whatever changed while it was joining', async () => {
    const setup = setUp();
    await setup.sync.start();
    // Read, but not yet listening: a signal sent now reaches nobody.
    setup.server.put('catches', catchRow({ id: 'while-joining' }));
    setup.server.status('live');
    await settle();
    await setup.sync.settled();
    expect(catchIds(setup.sync)).toEqual(['while-joining']);
  });

  it('reads once more a few seconds after joining, for what the relay missed', async () => {
    const setup = setUp();
    await setup.sync.start();
    setup.server.status('live');
    await settle();
    await setup.sync.settled();
    // Changed after the first read, before Supabase relayed anything.
    setup.server.put('catches', catchRow({ id: 'before-relay' }));
    await setup.timers.advance(5000);
    await setup.sync.settled();
    expect(catchIds(setup.sync)).toEqual(['before-relay']);
  });

  it('reads everything again each time listening starts again', async () => {
    const setup = setUp();
    await live(setup);

    // Changed while the connection was down: no signal will ever come for it.
    setup.server.put('catches', catchRow({ id: 'missed' }));
    setup.server.status('lost');
    await settle();
    expect(setup.sync.getState().connection).toBe('reconnecting');
    expect(setup.server.listening()).toEqual([]);

    await setup.timers.advance(2400);
    setup.server.status('live');
    await settle();
    await setup.sync.settled();
    expect(setup.sync.getState().connection).toBe('live');
    expect(catchIds(setup.sync)).toEqual(['missed']);
  });

  it('reads again only the rows a signal names', async () => {
    const setup = setUp();
    await live(setup);

    setup.server.put('catches', catchRow({ id: 'c2' }));
    setup.server.signal(TOPIC, { table: 'catches', key: { id: 'c2' } });
    await setup.timers.advance(250);
    await setup.sync.settled();

    expect(setup.server.reads).toEqual(['catches id=c2']);
    expect(catchIds(setup.sync)).toEqual(['c2']);
  });

  it('takes a catch off the board when the director overturns it', async () => {
    const setup = setUp();
    // As for any phone but the angler's: only approved catches are visible.
    setup.server.canSee = (table, row) => table !== 'catches' || row['status'] === 'approved';
    setup.server.put('catches', catchRow({ id: 'c1', status: 'approved' }));
    await live(setup);
    expect(catchIds(setup.sync)).toEqual(['c1']);

    setup.server.put('catches', catchRow({ id: 'c1', status: 'rejected' }));
    setup.server.signal(TOPIC, { table: 'catches', key: { id: 'c1' } });
    await setup.timers.advance(250);
    await setup.sync.settled();
    expect(catchIds(setup.sync)).toEqual([]);
  });

  it('reads a table whole when many of its rows change at once', async () => {
    const setup = setUp();
    await live(setup);
    for (let i = 0; i < 60; i += 1) {
      setup.server.signal(TOPIC, { table: 'catches', key: { id: `c${String(i)}` } });
    }
    await setup.timers.advance(250);
    await setup.sync.settled();
    expect(setup.server.reads).toEqual([`catches ${EVENT_ID}`]);
  });

  it('reads a table whole for a signal naming more than one column', async () => {
    const setup = setUp();
    await live(setup);
    setup.server.put('check_ins', checkInRow());
    setup.server.signal(TOPIC, {
      table: 'check_ins',
      key: { angler_id: 'angler-1', day: '2027-09-18' },
    });
    await setup.timers.advance(250);
    await setup.sync.settled();
    expect(setup.server.reads).toEqual([`check_ins ${EVENT_ID}`]);
    expect(setup.sync.getState().tables.check_ins.size).toBe(1);
  });

  it('follows the director to another event, leaving nothing of the last one', async () => {
    const setup = setUp();
    setup.server.put('catches', catchRow({ id: 'c1' }));
    await live(setup);

    setup.server.put('events', eventRow({ is_current: false }));
    setup.server.put('events', eventRow({ id: OTHER_EVENT_ID, name: 'Fall Classic' }));
    setup.server.signal('events', { table: 'events', key: { id: OTHER_EVENT_ID } });
    await setup.timers.advance(250);
    await setup.sync.settled();

    expect(setup.sync.getState().event?.name).toBe('Fall Classic');
    expect(catchIds(setup.sync)).toEqual([]);
    expect(setup.server.listening()).toEqual(['events', `event:${OTHER_EVENT_ID}`]);
  });

  it('saves its copy a moment after it changes', async () => {
    const setup = setUp();
    setup.server.put('catches', catchRow({ id: 'c1' }));
    await live(setup);
    await setup.timers.advance(1000);
    const saved = await setup.local.loadSnapshot();
    expect(saved?.schema).toBe('v1');
    expect(saved?.tables.catches?.map((c) => c.id)).toEqual(['c1']);
  });

  it('saves its copy at once when the app is put away', async () => {
    const setup = setUp();
    await live(setup);
    setup.server.put('catches', catchRow({ id: 'c1' }));
    setup.server.signal(TOPIC, { table: 'catches', key: { id: 'c1' } });
    await setup.timers.advance(250);
    await setup.sync.settled();
    expect((await setup.local.loadSnapshot())?.tables.catches ?? []).toEqual([]);

    // Swiped away, or reloaded, before the moment was up.
    setup.sync.becameHidden();
    await settle();
    const saved = await setup.local.loadSnapshot();
    expect(saved?.tables.catches?.map((c) => c.id)).toEqual(['c1']);
  });

  it('says so when the server will not sign the phone in', async () => {
    const setup = setUp();
    setup.server.signInsRefused = 'Anonymous sign-ins are disabled for this project.';
    await setup.sync.start();
    expect(setup.sync.getState().connection).toBe('refused');
    expect(setup.sync.getState().problem).toBe('Anonymous sign-ins are disabled for this project.');
  });

  it('stops listening when signal goes, and starts afresh when it returns', async () => {
    const setup = setUp();
    await live(setup);
    setup.server.online = false;
    setup.sync.wentOffline();
    expect(setup.sync.getState().connection).toBe('offline');
    expect(setup.server.listening()).toEqual([]);

    setup.server.put('catches', catchRow({ id: 'while-away' }));
    setup.server.online = true;
    setup.sync.wentOnline();
    await settle();
    expect(setup.server.listening()).toEqual(['events', TOPIC]);
    expect(setup.sync.getState().connection).toBe('connecting');
    setup.server.status('live');
    await settle();
    await setup.sync.settled();
    expect(setup.sync.getState().connection).toBe('live');
    expect(catchIds(setup.sync)).toEqual(['while-away']);
  });

  it('reads everything again when reopened after more than a minute away', async () => {
    const setup = setUp();
    await live(setup);
    setup.sync.becameHidden();
    await setup.timers.advance(30_000);
    setup.sync.becameVisible();
    await setup.sync.settled();
    expect(setup.server.reads).toEqual([]);

    setup.server.put('catches', catchRow({ id: 'while-frozen' }));
    setup.sync.becameHidden();
    await setup.timers.advance(90_000);
    setup.sync.becameVisible();
    await settle();
    await setup.sync.settled();
    expect(catchIds(setup.sync)).toEqual(['while-frozen']);
  });

  it('reads beacons again every minute while open, in case a signal was lost', async () => {
    const setup = setUp();
    await live(setup);
    const beaconIds = () => [...setup.sync.getState().tables.beacons.values()].map((b) => b.id);
    // Raised, and its signal lost on the way.
    setup.server.put('beacons', {
      id: 'b1',
      angler_id: 'angler-1',
      event_id: EVENT_ID,
      note: 'Taking on water',
      lat: 46.39,
      lng: -111.57,
      accuracy_miles: 0.01,
      position_at: '2027-09-18T15:00:00Z',
      raised_at: '2027-09-18T15:00:00Z',
      stood_down_at: null,
      stood_down_by: null,
    });
    await setup.timers.advance(54_000);
    await setup.sync.settled();
    expect(beaconIds()).toEqual([]);
    await setup.timers.advance(1_000);
    await setup.sync.settled();
    expect(beaconIds()).toEqual(['b1']);
    expect(setup.server.reads).toEqual([`beacons ${EVENT_ID}`]);

    // Hidden, it waits: coming back after a minute reads everything anyway.
    setup.server.reads.length = 0;
    setup.sync.becameHidden();
    await setup.timers.advance(180_000);
    await setup.sync.settled();
    expect(setup.server.reads).toEqual([]);
  });

  it('waits for signal, then connects', async () => {
    const setup = setUp();
    setup.server.online = false;
    await setup.sync.start();
    expect(setup.sync.getState().connection).toBe('offline');

    setup.server.online = true;
    setup.sync.wentOnline();
    await settle();
    expect(setup.server.signIns).toBe(1);
    expect(setup.sync.getState().event?.name).toBe('Montana Kayak Walleye Open');
  });

  it('measures how far the phone’s clock is off, and keeps it for when there is no signal', async () => {
    const local = new MemoryStore();
    const first = setUp(local);
    first.server.clockAheadMs = 12 * 60_000;
    await first.sync.start();
    await settle();
    const offset = first.sync.getState().clock?.offsetMs ?? 0;
    expect(Math.abs(offset - 12 * 60_000)).toBeLessThan(1000);
    await first.timers.advance(1000);

    const reopened = setUp(local);
    reopened.server.online = false;
    await reopened.sync.start();
    expect(reopened.sync.getState().clock?.offsetMs).toBe(offset);
  });

  it('sends what was waiting in the outbox once it connects', async () => {
    const setup = setUp();
    setup.server.online = false;
    await setup.sync.start();
    await setup.sync.outbox.add({
      id: 'p1',
      label: 'Chat message',
      createdAt: 0,
      steps: [{ kind: 'call', fn: 'post_message', args: { p_id: 'p1', p_body: 'Fish on' } }],
    });
    await setup.sync.settled();
    expect(setup.sync.getState().outbox.items).toHaveLength(1);

    setup.server.online = true;
    setup.sync.wentOnline();
    await setup.sync.settled();
    expect(setup.server.calls.map((c) => c.fn)).toEqual(['post_message']);
    expect(setup.sync.getState().outbox.items).toEqual([]);
  });
});
