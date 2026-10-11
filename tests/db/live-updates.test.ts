// Live updates. Every change to a row a phone holds sends a signal on its
// event's topic naming the row and nothing more; the phone then reads the row
// again under its own rules. These check the signals are sent, say no more
// than they should, and that only signed-in phones can listen and none can
// send.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rowOf, rowsOf, TestDb, type Caller, type Signal } from './harness';
import { codeOf, registerSolo, setUpEvent } from './fixtures';
import { KEYS } from '../../src/data/tables';

let db: TestDb;
let director: Caller;
let eventId: string;
let topic: string;

beforeAll(async () => {
  db = await TestDb.open();
  ({ director, eventId } = await setUpEvent(db));
  topic = `event:${eventId}`;
});
afterAll(async () => {
  await db.close();
});

/** What a set of signals named, as "table key=value ...", ignoring order. */
function named(signals: readonly Signal[]): string[] {
  return [
    ...new Set(
      signals.map(({ payload }) =>
        [
          payload.table,
          ...Object.entries(payload.key).map(([column, value]) => `${column}=${String(value)}`),
        ].join(' '),
      ),
    ),
  ].sort();
}

/** The signals a step sent on the event's topic. */
async function signalsFrom(step: () => Promise<unknown>): Promise<Signal[]> {
  const before = (await db.signals(topic)).length;
  await step();
  return (await db.signals(topic)).slice(before);
}

async function fileCatch(phone: Caller, anglerId: string, inches = 20): Promise<string> {
  const id = randomUUID();
  rowOf(
    await db.call(phone, 'file_catch', {
      p_id: id,
      p_angler_id: anglerId,
      p_species: 'Walleye',
      p_length_inches: inches,
      p_logged_at: new Date().toISOString(),
      p_lat: 46.39,
      p_lng: -111.57,
    }),
  );
  return id;
}

describe('a signal', () => {
  it('names a filed catch and its evidence, privately, and carries nothing else', async () => {
    const phone = await db.device('phone');
    const { angler } = await registerSolo(db, phone, eventId);
    let catchId = '';
    const sent = await signalsFrom(async () => {
      catchId = await fileCatch(phone, angler.id);
    });

    expect(named(sent)).toEqual([`catch_evidence catch_id=${catchId}`, `catches id=${catchId}`]);
    for (const signal of sent) {
      expect(signal.event).toBe('change');
      expect(signal.private).toBe(true);
      // Realtime adds an id of its own; nothing else rides along.
      expect(Object.keys(signal.payload).sort()).toEqual(['id', 'key', 'table']);
    }
  });

  it('reaches the field when the director overturns a catch it could see', async () => {
    const phone = await db.device('phone');
    const field = await db.device('someone else');
    const { angler } = await registerSolo(db, phone, eventId);
    const catchId = await fileCatch(phone, angler.id, 24);
    rowOf(
      await db.call(director, 'director_review_catch', { p_id: catchId, p_status: 'approved' }),
    );
    const seen = () => db.as(field, `select id from public.catches where id = $1`, [catchId]);
    expect(rowsOf(await seen())).toHaveLength(1);

    const sent = await signalsFrom(() =>
      db.call(director, 'director_review_catch', { p_id: catchId, p_status: 'rejected' }),
    );

    // The field is told, asks again, and the fish is gone from its board.
    expect(named(sent)).toContain(`catches id=${catchId}`);
    expect(rowsOf(await seen())).toHaveLength(0);
  });

  it('follows a removed entry to every row that went with it', async () => {
    const phone = await db.device('phone');
    const { summary, angler } = await registerSolo(db, phone, eventId);
    const catchId = await fileCatch(phone, angler.id);

    const sent = await signalsFrom(() =>
      db.call(director, 'director_remove_entry', { p_entry_id: summary.entryId }),
    );

    expect(named(sent)).toEqual(
      [
        `angler_private angler_id=${angler.id}`,
        `anglers id=${angler.id}`,
        `catch_evidence catch_id=${catchId}`,
        `catches id=${catchId}`,
        `entries id=${summary.entryId}`,
        `entry_devices entry_id=${summary.entryId}`,
        `entry_private entry_id=${summary.entryId}`,
      ].sort(),
    );
  });

  it('names the entry a phone joins, never the phone', async () => {
    const phone = await db.device('phone');
    const { summary, angler } = await registerSolo(db, phone, eventId);
    const second = await db.device('second phone');

    const sent = await signalsFrom(() =>
      db.call(second, 'claim_entry', {
        p_code: codeOf(summary, angler.id),
        p_phone: angler.phone,
      }),
    );

    expect(named(sent)).toEqual([`entry_devices entry_id=${summary.entryId}`]);
    expect(JSON.stringify(sent)).not.toContain(second.userId);
  });

  it('about the list of events goes on its own topic', async () => {
    const before = (await db.signals('events')).length;
    const { eventId: other } = await setUpEvent(db, { director, current: false });
    const sent = (await db.signals('events')).slice(before);
    expect(named(sent)).toContain(`events id=${other}`);
    expect(await db.signals(`event:${other}`)).not.toHaveLength(0);
  });
});

describe('the app', () => {
  it('knows every table and its primary key, as the database declares them', async () => {
    const keys = await db.admin<{ table: string; columns: string[] }>(`
      select c.relname as table,
        array_agg(a.attname::text order by array_position(i.indkey, a.attnum)) as columns
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum = any (i.indkey)
      where n.nspname = 'public' and i.indisprimary
      group by c.relname`);
    expect(Object.fromEntries(keys.map((k) => [k.table, k.columns]))).toEqual(KEYS);
  });
});

describe('the signal topics', () => {
  /** How many of a topic's signals a caller can read while listening on it. */
  async function heard(who: Caller, listeningOn: string): Promise<number> {
    const result = await db.as<{ n: number }>(
      who,
      `select count(*)::int as n from realtime.messages where topic = $1`,
      [listeningOn],
      { 'realtime.topic': listeningOn },
    );
    return rowOf(result).n;
  }

  it('are open to signed-in phones', async () => {
    const phone = await db.device('phone');
    expect(await heard(phone, topic)).toBeGreaterThan(0);
    expect(await heard(phone, 'events')).toBeGreaterThan(0);
  });

  it('are closed to a phone that has not signed in', async () => {
    expect(await heard(db.anon, topic)).toBe(0);
  });

  it('are the only topics a phone can listen on', async () => {
    const phone = await db.device('phone');
    await db.admin(`select realtime.send('{"x": 1}', 'change', 'director-only', true)`);
    expect(await heard(phone, 'director-only')).toBe(0);
  });

  it('cannot be sent on by a phone', async () => {
    const phone = await db.device('phone');
    const before = (await db.signals(topic)).length;
    const forged = await db.as(
      phone,
      `insert into realtime.messages (topic, extension, payload, event, private)
       values ($1, 'broadcast', '{"table": "catches", "key": {}}', 'change', true)`,
      [topic],
    );
    expect(forged.ok).toBe(false);
    // realtime.send swallows the refusal as a warning; nothing is sent.
    rowsOf(
      await db.as(
        phone,
        `select realtime.send('{"table": "catches", "key": {}}', 'change', $1, true)`,
        [topic],
      ),
    );
    expect(await db.signals(topic)).toHaveLength(before);
  });
});
