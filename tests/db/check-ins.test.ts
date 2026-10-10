import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, rowOf, rowsOf, TestDb, type Caller } from './harness';
import { DAY_1, DAY_2, registerSolo, registerTeam, setUpEvent } from './fixtures';

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

interface CheckInRow {
  in_at: string | Date | null;
  out_at: string | Date | null;
}

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const ms = (v: string | Date | null) => (v === null ? null : new Date(v).getTime());

async function angler() {
  const phone = await db.device('phone');
  const { angler: a } = await registerSolo(db, phone, eventId);
  return { phone, anglerId: a.id };
}

describe('checking in and out', () => {
  it('records the phone’s times, and the first time stands', async () => {
    const { phone, anglerId } = await angler();
    const first = rowOf(
      await db.call<CheckInRow>(phone, 'check_in', {
        p_angler_id: anglerId,
        p_day: DAY_1,
        p_at: at(120),
      }),
    );
    const again = rowOf(
      await db.call<CheckInRow>(phone, 'check_in', {
        p_angler_id: anglerId,
        p_day: DAY_1,
        p_at: at(10),
      }),
    );
    expect(ms(again.in_at)).toBe(ms(first.in_at));
    const out = rowOf(
      await db.call<CheckInRow>(phone, 'check_out', {
        p_angler_id: anglerId,
        p_day: DAY_1,
        p_at: at(5),
      }),
    );
    expect(ms(out.out_at)).toBeGreaterThan(ms(out.in_at) ?? 0);
  });

  it('keeps each day separate', async () => {
    const { phone, anglerId } = await angler();
    rowOf(await db.call(phone, 'check_in', { p_angler_id: anglerId, p_day: DAY_1, p_at: at(60) }));
    rowOf(await db.call(phone, 'check_in', { p_angler_id: anglerId, p_day: DAY_2, p_at: at(30) }));
    const rows = rowsOf(
      await db.as(phone, `select day from public.check_ins where angler_id = $1 order by day`, [
        anglerId,
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it('refuses a day that is not one of the event’s', async () => {
    const { phone, anglerId } = await angler();
    expect(
      errorOf(await db.call(phone, 'check_in', { p_angler_id: anglerId, p_day: '2027-09-25' })),
    ).toBe('not_an_event_day');
  });

  it('cannot check out without having checked in', async () => {
    const { phone, anglerId } = await angler();
    expect(
      errorOf(await db.call(phone, 'check_out', { p_angler_id: anglerId, p_day: DAY_1 })),
    ).toBe('not_checked_in');
  });

  it('never records a check-out before the check-in', async () => {
    const { phone, anglerId } = await angler();
    const checkedIn = rowOf(
      await db.call<CheckInRow>(phone, 'check_in', {
        p_angler_id: anglerId,
        p_day: DAY_1,
        p_at: at(30),
      }),
    );
    const out = rowOf(
      await db.call<CheckInRow>(phone, 'check_out', {
        p_angler_id: anglerId,
        p_day: DAY_1,
        p_at: at(60),
      }),
    );
    expect(ms(out.out_at)).toBe(ms(checkedIn.in_at));
  });

  it('lets a captain check the partner in, and nobody else', async () => {
    const captain = await db.device('captain');
    const { partner } = await registerTeam(db, captain, eventId);
    expect((await db.call(captain, 'check_in', { p_angler_id: partner.id, p_day: DAY_1 })).ok).toBe(
      true,
    );
    expect(
      errorOf(
        await db.call(await db.device('stranger'), 'check_in', {
          p_angler_id: partner.id,
          p_day: DAY_1,
        }),
      ),
    ).toBe('not_your_entry');
  });

  it('shows a check-in to the angler and the director only', async () => {
    const { phone, anglerId } = await angler();
    rowOf(await db.call(phone, 'check_in', { p_angler_id: anglerId, p_day: DAY_1 }));
    const sql = `select angler_id from public.check_ins where angler_id = $1`;
    expect(rowsOf(await db.as(await db.device('stranger'), sql, [anglerId]))).toEqual([]);
    expect(rowsOf(await db.as(director, sql, [anglerId]))).toHaveLength(1);
  });
});

describe('the director putting a day right', () => {
  it('sets or clears a time', async () => {
    const { phone, anglerId } = await angler();
    rowOf(await db.call(phone, 'check_in', { p_angler_id: anglerId, p_day: DAY_1, p_at: at(90) }));
    const fixed = rowOf(
      await db.call<CheckInRow>(director, 'director_set_check_in', {
        p_angler_id: anglerId,
        p_day: DAY_1,
        p_in_at: at(90),
        p_out_at: at(1),
      }),
    );
    expect(fixed.out_at).not.toBeNull();
    expect(
      errorOf(
        await db.call(phone, 'director_set_check_in', {
          p_angler_id: anglerId,
          p_day: DAY_1,
          p_in_at: null,
          p_out_at: null,
        }),
      ),
    ).toBe('director_only');
  });

  it('cannot drop a fishing day that already has check-ins', async () => {
    const { phone, anglerId } = await angler();
    rowOf(await db.call(phone, 'check_in', { p_angler_id: anglerId, p_day: DAY_2 }));
    const [event] = await db.admin<{ registration_closes_at: Date }>(
      `select registration_closes_at from public.events where id = $1`,
      [eventId],
    );
    const result = await db.call(director, 'director_save_event', {
      p_id: eventId,
      p_name: 'Montana Kayak Walleye Open',
      p_entry_prefix: 'MKWO',
      p_time_zone: 'America/Denver',
      p_registration_closes_at: event?.registration_closes_at,
      p_days: [DAY_1],
    });
    expect(errorOf(result)).toBe('day_in_use');
  });
});
