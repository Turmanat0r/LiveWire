import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, rowOf, rowsOf, TestDb, type Caller } from './harness';
import { registerSolo, setUpEvent } from './fixtures';

let db: TestDb;
let director: Caller;
let eventId: string;

beforeAll(async () => {
  db = await TestDb.open();
  ({ director, eventId } = await setUpEvent(db));
});
afterAll(async () => {
  await db.close();
});

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

async function angler() {
  const phone = await db.device('phone');
  const { angler: a } = await registerSolo(db, phone, eventId);
  return { phone, anglerId: a.id };
}

const positionsSeenBy = async (who: Caller, anglerId: string) =>
  rowsOf(
    await db.as(who, `select angler_id from public.positions where angler_id = $1`, [anglerId]),
  ).length;
const beaconsSeenBy = async (who: Caller, anglerId: string) =>
  rowsOf(
    await db.as<{ note: string }>(
      who,
      `select note from public.beacons where angler_id = $1 and stood_down_at is null`,
      [anglerId],
    ),
  );

describe('positions', () => {
  it('are the angler’s and the director’s, never the field’s', async () => {
    const { phone, anglerId } = await angler();
    rowOf(
      await db.call(phone, 'record_position', {
        p_angler_id: anglerId,
        p_lat: 46.4,
        p_lng: -111.6,
      }),
    );
    expect(await positionsSeenBy(phone, anglerId)).toBe(1);
    expect(await positionsSeenBy(director, anglerId)).toBe(1);
    expect(await positionsSeenBy(await db.device('rival'), anglerId)).toBe(0);
  });

  it('keep the newest fix when an older one arrives late', async () => {
    const { phone, anglerId } = await angler();
    rowOf(
      await db.call(phone, 'record_position', {
        p_angler_id: anglerId,
        p_lat: 46.5,
        p_lng: -111.5,
        p_at: at(1),
      }),
    );
    const late = rowOf(
      await db.call<{ lat: number }>(phone, 'record_position', {
        p_angler_id: anglerId,
        p_lat: 46.1,
        p_lng: -111.1,
        p_at: at(30),
      }),
    );
    expect(late.lat).toBe(46.5);
  });
});

describe('beacons', () => {
  it('reach every signed-in phone, with the note', async () => {
    const { phone, anglerId } = await angler();
    rowOf(
      await db.call(phone, 'raise_beacon', {
        p_angler_id: anglerId,
        p_lat: 46.4,
        p_lng: -111.6,
        p_note: 'Flipped, cold',
      }),
    );
    expect(await beaconsSeenBy(await db.device('nearest kayak'), anglerId)).toEqual([
      { note: 'Flipped, cold' },
    ]);
  });

  it('do not reach a phone that has not signed in', async () => {
    const { phone, anglerId } = await angler();
    rowOf(
      await db.call(phone, 'raise_beacon', { p_angler_id: anglerId, p_lat: 46.4, p_lng: -111.6 }),
    );
    expect((await db.as(db.anon, `select id from public.beacons`)).ok).toBe(false);
  });

  it('move with the angler', async () => {
    const { phone, anglerId } = await angler();
    rowOf(
      await db.call(phone, 'raise_beacon', {
        p_angler_id: anglerId,
        p_lat: 46.4,
        p_lng: -111.6,
        p_at: at(2),
      }),
    );
    rowOf(
      await db.call(phone, 'record_position', {
        p_angler_id: anglerId,
        p_lat: 46.45,
        p_lng: -111.65,
      }),
    );
    const [beacon] = rowsOf(
      await db.as<{ lat: number }>(
        await db.device('rescuer'),
        `select lat from public.beacons where angler_id = $1`,
        [anglerId],
      ),
    );
    expect(beacon?.lat).toBe(46.45);
  });

  it('stay one per angler: raising again updates the note', async () => {
    const { phone, anglerId } = await angler();
    rowOf(
      await db.call(phone, 'raise_beacon', {
        p_angler_id: anglerId,
        p_lat: 46.4,
        p_lng: -111.6,
        p_note: 'first',
      }),
    );
    rowOf(
      await db.call(phone, 'raise_beacon', {
        p_angler_id: anglerId,
        p_lat: 46.4,
        p_lng: -111.6,
        p_note: 'second',
      }),
    );
    expect(await beaconsSeenBy(director, anglerId)).toEqual([{ note: 'second' }]);
  });

  it('can be stood down by the angler or the director, and the record is kept', async () => {
    const { phone, anglerId } = await angler();
    rowOf(
      await db.call(phone, 'raise_beacon', { p_angler_id: anglerId, p_lat: 46.4, p_lng: -111.6 }),
    );
    const rival = await db.device('rival');
    expect(errorOf(await db.call(rival, 'stand_down_beacon', { p_angler_id: anglerId }))).toBe(
      'not_your_entry',
    );
    rowsOf(await db.call(director, 'stand_down_beacon', { p_angler_id: anglerId }));
    expect(await beaconsSeenBy(rival, anglerId)).toEqual([]);
    const history = await db.admin(`select id from public.beacons where angler_id = $1`, [
      anglerId,
    ]);
    expect(history).toHaveLength(1);
  });

  it('go up from a phone whose clock is fast, at the server’s time', async () => {
    const { phone, anglerId } = await angler();
    const raised = rowOf(
      await db.call<{ position_at: string }>(phone, 'raise_beacon', {
        p_angler_id: anglerId,
        p_lat: 46.4,
        p_lng: -111.6,
        p_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
    );
    expect(Date.parse(raised.position_at)).toBeLessThan(Date.now() + 60_000);
    // A real fix a minute later still moves it.
    rowOf(
      await db.call(phone, 'record_position', {
        p_angler_id: anglerId,
        p_lat: 46.41,
        p_lng: -111.6,
        p_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    const [moved] = await db.admin<{ lat: number }>(
      `select lat from public.beacons where angler_id = $1 and stood_down_at is null`,
      [anglerId],
    );
    expect(moved?.lat).toBe(46.41);
  });

  it('cannot be raised for somebody else', async () => {
    const { anglerId } = await angler();
    const result = await db.call(await db.device('prankster'), 'raise_beacon', {
      p_angler_id: anglerId,
      p_lat: 46.4,
      p_lng: -111.6,
    });
    expect(errorOf(result)).toBe('not_your_entry');
  });
});

describe('the director’s number for a text', () => {
  const numberSeenBy = async (who: Caller) =>
    rowsOf(
      await db.as<{ phone: string }>(
        who,
        `select phone from public.event_safety where event_id = $1`,
        [eventId],
      ),
    ).map((r) => r.phone);

  it('reaches the event’s own anglers and the director, and no one else', async () => {
    rowOf(
      await db.call(director, 'director_set_safety_contact', {
        p_event_id: eventId,
        p_phone: '(406) 555-0142',
      }),
    );
    const { phone } = await angler();
    expect(await numberSeenBy(phone)).toEqual(['(406) 555-0142']);
    expect(await numberSeenBy(director)).toEqual(['(406) 555-0142']);
    expect(await numberSeenBy(await db.device('just opened the app'))).toEqual([]);
    expect((await db.as(db.anon, `select phone from public.event_safety`)).ok).toBe(false);
  });

  it('is set only by the director, complete, and cleared with an empty one', async () => {
    const { phone } = await angler();
    expect(
      errorOf(
        await db.call(phone, 'director_set_safety_contact', {
          p_event_id: eventId,
          p_phone: '406-555-0199',
        }),
      ),
    ).toBe('director_only');
    expect(
      errorOf(
        await db.call(director, 'director_set_safety_contact', {
          p_event_id: eventId,
          p_phone: '555-0199',
        }),
      ),
    ).toBe('phone_incomplete');
    rowsOf(
      await db.call(director, 'director_set_safety_contact', { p_event_id: eventId, p_phone: '' }),
    );
    expect(await numberSeenBy(director)).toEqual([]);
  });
});
