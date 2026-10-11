import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, rowOf, rowsOf, TestDb, type Caller } from './harness';
import { DAY_1, DAY_2, setUpEvent } from './fixtures';

let db: TestDb;
let director: Caller;

beforeAll(async () => {
  db = await TestDb.open();
  director = await db.director();
});
afterAll(async () => {
  await db.close();
});

const save = (who: Caller, over: Record<string, unknown> = {}) =>
  db.call<{ id: string }>(who, 'director_save_event', {
    p_id: randomUUID(),
    p_name: 'Practice day',
    p_entry_prefix: 'prac',
    p_time_zone: 'America/Denver',
    p_registration_closes_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_days: [DAY_1, DAY_2],
    ...over,
  });

describe('setting up an event', () => {
  it('is the director’s alone', async () => {
    expect(errorOf(await save(await db.device('angler')))).toBe('director_only');
    expect((await save(db.anon)).ok).toBe(false);
  });

  it('saves an event with its days, and edits it in place', async () => {
    const id = randomUUID();
    rowOf(await save(director, { p_id: id }));
    rowOf(await save(director, { p_id: id, p_name: 'Practice day (moved)', p_days: [DAY_2] }));
    const [event] = await db.admin<{ name: string; entry_prefix: string }>(
      `select name, entry_prefix from public.events where id = $1`,
      [id],
    );
    expect(event).toEqual({ name: 'Practice day (moved)', entry_prefix: 'PRAC' });
    const days = await db.admin<{ day: string | Date }>(
      `select day::text as day from public.event_days where event_id = $1`,
      [id],
    );
    expect(days.map((d) => d.day)).toEqual([DAY_2]);
  });

  it('refuses what the phones could not use', async () => {
    expect(errorOf(await save(director, { p_time_zone: 'Mars/Olympus' }))).toBe(
      'invalid_time_zone',
    );
    expect(errorOf(await save(director, { p_days: [] }))).toBe('invalid_days');
    expect(
      (await save(director, { p_course: { kind: 'polygon', points: [{ lat: 1, lng: 1 }] } })).ok,
    ).toBe(false);
    expect((await save(director, { p_payout_basis_points: [6000, 5000] })).ok).toBe(false);
    expect((await save(director, { p_lines_in: '15:00', p_lines_out: '14:00' })).ok).toBe(false);
  });

  it('keeps the species in order, and never scores Other', async () => {
    const { id } = rowOf(await save(director));
    const species = rowsOf(
      await db.call<{ name: string }>(director, 'director_set_event_species', {
        p_event_id: id,
        p_species: JSON.stringify([
          { name: 'Walleye', recordInches: 36 },
          { name: 'Pike', recordInches: 60 },
        ]),
      }),
    );
    expect(species.map((s) => s.name)).toEqual(['Walleye', 'Pike']);
    const other = await db.call(director, 'director_set_event_species', {
      p_event_id: id,
      p_species: JSON.stringify([{ name: 'Other' }]),
    });
    expect(other.ok).toBe(false);
  });
});

describe('the current event', () => {
  it('is one event at a time, and every phone can read which', async () => {
    const first = await setUpEvent(db, { director });
    const second = await setUpEvent(db, { director });
    const current = await db.admin<{ id: string }>(`select id from public.events where is_current`);
    expect(current.map((e) => e.id)).toEqual([second.eventId]);
    expect(first.eventId).not.toBe(second.eventId);
    expect(rowsOf(await db.as(db.anon, `select id from public.events where is_current`))).toEqual([
      { id: second.eventId },
    ]);
  });

  it('cannot be archived, or deleted', async () => {
    const { eventId } = await setUpEvent(db, { director });
    expect(
      errorOf(
        await db.call(director, 'director_archive_event', {
          p_event_id: eventId,
          p_archived: true,
        }),
      ),
    ).toBe('cannot_archive');
    expect(errorOf(await db.call(director, 'director_delete_event', { p_event_id: eventId }))).toBe(
      'event_is_current',
    );
  });
});
