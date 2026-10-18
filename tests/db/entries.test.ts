import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, rowOf, rowsOf, TestDb, type Caller } from './harness';
import {
  codeOf,
  DAY_1,
  DAY_2,
  registerSolo,
  registerTeam,
  registrant,
  setUpEvent,
  type EntrySummary,
} from './fixtures';

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

const register = (
  who: Caller,
  captain: object,
  opts: { partner?: object; entryId?: string; event?: string } = {},
) =>
  db.call<{ register_entry: EntrySummary }>(who, 'register_entry', {
    p_entry_id: opts.entryId ?? randomUUID(),
    p_event_id: opts.event ?? eventId,
    p_division: opts.partner ? 'team' : 'solo',
    p_captain: captain,
    p_partner: opts.partner ?? null,
  });

describe('registering', () => {
  it('registers a solo angler with a board code and the next entry number', async () => {
    const phone = await db.device('phone');
    const { summary, angler } = await registerSolo(db, phone, eventId);
    expect(summary.division).toBe('solo');
    expect(summary.entryNumber).toBeGreaterThan(0);
    expect(summary.feePaid).toBe(false);
    expect(summary.teamCode).toBeNull();
    expect(summary.anglers).toHaveLength(1);
    expect(summary.anglers[0]).toMatchObject({
      id: angler.id,
      role: 'solo',
      handle: angler.handle,
    });
    expect(codeOf(summary, angler.id)).toMatch(/^[34679ACDEFHJKMNPQRTWXY]{4}$/);
  });

  it('registers a team: two anglers, two personal codes, one team code', async () => {
    const phone = await db.device('captain phone');
    const { summary, captain, partner } = await registerTeam(db, phone, eventId);
    expect(summary.division).toBe('team');
    expect(summary.teamCode).toMatch(/^[34679ACDEFHJKMNPQRTWXY]{4}$/);
    const codes = [codeOf(summary, captain.id), codeOf(summary, partner.id), summary.teamCode];
    expect(new Set(codes).size).toBe(3);
    expect(summary.anglers.map((a) => a.role).sort()).toEqual(['captain', 'partner']);
  });

  it('numbers entries in order, a team counting once', async () => {
    const a = (await registerSolo(db, await db.device('a'), eventId)).summary.entryNumber;
    const b = (await registerTeam(db, await db.device('b'), eventId)).summary.entryNumber;
    const c = (await registerSolo(db, await db.device('c'), eventId)).summary.entryNumber;
    expect([b - a, c - b]).toEqual([1, 1]);
  });

  it('answers a retry with the entry it already made', async () => {
    const phone = await db.device('retrying phone');
    const entryId = randomUUID();
    const form = registrant();
    const first = rowOf(await register(phone, form, { entryId })).register_entry;
    const again = rowOf(await register(phone, form, { entryId })).register_entry;
    expect(again).toEqual(first);
  });

  it('refuses a second entry from the same device', async () => {
    const phone = await db.device('greedy phone');
    await registerSolo(db, phone, eventId);
    expect(errorOf(await register(phone, registrant()))).toBe('device_already_registered');
  });

  it('refuses the same person twice, by name or by phone, whatever the formatting', async () => {
    const first = await registerSolo(db, await db.device('first'), eventId);
    const sameName = registrant({ fullName: `  ${first.angler.fullName.toUpperCase()}  ` });
    expect(errorOf(await register(await db.device('second'), sameName))).toBe(
      'already_registered_name',
    );
    const digits = first.angler.phone.replace(/\D/g, '');
    const samePhone = registrant({
      phone: `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6)}`,
    });
    expect(errorOf(await register(await db.device('third'), samePhone))).toBe(
      'already_registered_phone',
    );
  });

  it('refuses a handle already on the roster, ignoring case', async () => {
    const first = await registerSolo(db, await db.device('first'), eventId);
    const clash = registrant({ handle: first.angler.handle.toLowerCase() });
    expect(errorOf(await register(await db.device('second'), clash))).toBe('handle_taken');
  });

  it('checks the form the way the screen does', async () => {
    const phone = await db.device('careless phone');
    const bad = async (over: object) => errorOf(await register(phone, registrant(over)));
    expect(await bad({ fullName: '  ' })).toBe('name_required');
    expect(await bad({ phone: '555-0100' })).toBe('phone_required');
    expect(await bad({ emergencyName: '' })).toBe('emergency_contact_required');
    const own = registrant();
    expect(errorOf(await register(phone, { ...own, emergencyPhone: own.phone }))).toBe(
      'emergency_contact_is_self',
    );
    expect(errorOf(await register(phone, { ...registrant(), resident: null }))).toBe(
      'residency_required',
    );
  });

  it('needs two different people for a team', async () => {
    const phone = await db.device('team phone');
    const captain = registrant();
    expect(
      errorOf(
        await register(phone, captain, { partner: registrant({ fullName: captain.fullName }) }),
      ),
    ).toBe('team_needs_two_people');
    expect(
      errorOf(await register(phone, captain, { partner: registrant({ phone: captain.phone }) })),
    ).toBe('team_needs_two_phones');
  });

  it('closes when registration closes, except for the director', async () => {
    const { eventId: closed } = await setUpEvent(db, {
      closesInDays: -1,
      current: false,
      director,
    });
    expect(errorOf(await register(await db.device('late'), registrant(), { event: closed }))).toBe(
      'registration_closed',
    );
    const atRamp = rowOf(await register(director, registrant(), { event: closed })).register_entry;
    expect(atRamp.entryNumber).toBe(1);
  });

  it('does not tie the director’s device to an entry made at the ramp', async () => {
    await register(director, registrant());
    await register(director, registrant());
    const links = rowsOf(
      await db.as(director, `select * from public.entry_devices where user_id = $1`, [
        director.userId,
      ]),
    );
    expect(links).toEqual([]);
  });

  it('cannot be done by a phone that has not signed in', async () => {
    const result = await db.call(db.anon, 'register_entry', {
      p_entry_id: randomUUID(),
      p_event_id: eventId,
      p_division: 'solo',
      p_captain: registrant(),
    });
    expect(result.ok).toBe(false);
  });
});

describe('who can see what', () => {
  it('shows the field handles and divisions, and nothing private', async () => {
    const owner = await db.device('owner');
    const { summary, angler } = await registerSolo(db, owner, eventId);
    const stranger = await db.device('stranger');
    expect(
      rowsOf(await db.as(stranger, `select handle from public.anglers where id = $1`, [angler.id])),
    ).toEqual([{ handle: angler.handle }]);
    expect(
      rowsOf(
        await db.as(stranger, `select * from public.angler_private where angler_id = $1`, [
          angler.id,
        ]),
      ),
    ).toEqual([]);
    expect(
      rowsOf(
        await db.as(stranger, `select * from public.entry_private where entry_id = $1`, [
          summary.entryId,
        ]),
      ),
    ).toEqual([]);
  });

  it('shows an angler their own private details, and the director everyone’s', async () => {
    const owner = await db.device('owner');
    const { angler } = await registerSolo(db, owner, eventId);
    const sql = `select full_name from public.angler_private where angler_id = $1`;
    expect(rowsOf(await db.as(owner, sql, [angler.id]))).toEqual([{ full_name: angler.fullName }]);
    expect(rowsOf(await db.as(director, sql, [angler.id]))).toEqual([
      { full_name: angler.fullName },
    ]);
  });

  it('never lets a phone read the table that joins people across events', async () => {
    const result = await db.as(await db.device('nosy'), `select * from private.people`);
    expect(result.ok).toBe(false);
  });

  it('lets nobody write a table directly', async () => {
    const owner = await db.device('owner');
    const { angler } = await registerSolo(db, owner, eventId);
    const attempt = await db.as(
      owner,
      `update public.anglers set disqualified = false where id = $1`,
      [angler.id],
    );
    expect(attempt.ok).toBe(false);
    const fee = await db.as(owner, `update public.entry_private set fee_paid = true`);
    expect(fee.ok).toBe(false);
  });
});

describe('signing in to an entry from another device', () => {
  it('links a second device with the board code and the phone on the entry', async () => {
    const { summary, angler } = await registerSolo(db, await db.device('home screen app'), eventId);
    const browser = await db.device('browser');
    const claimed = rowOf(
      await db.call<{ claim_entry: EntrySummary }>(browser, 'claim_entry', {
        p_code: ` ${codeOf(summary, angler.id).toLowerCase()} `,
        p_phone: angler.phone,
      }),
    ).claim_entry;
    expect(claimed.entryId).toBe(summary.entryId);
    expect(claimed.anglerId).toBe(angler.id);
    const sql = `select full_name from public.angler_private where angler_id = $1`;
    expect(rowsOf(await db.as(browser, sql, [angler.id]))).toEqual([
      { full_name: angler.fullName },
    ]);
  });

  it('accepts a teammate’s phone, so a partner with no phone of their own can sign in', async () => {
    const { summary, captain, partner } = await registerTeam(
      db,
      await db.device('captain'),
      eventId,
    );
    const claimed = rowOf(
      await db.call<{ claim_entry: EntrySummary }>(
        await db.device('partner tablet'),
        'claim_entry',
        {
          p_code: codeOf(summary, partner.id),
          p_phone: captain.phone,
        },
      ),
    ).claim_entry;
    expect(claimed.anglerId).toBe(partner.id);
  });

  it('says nothing matched, without saying which half was wrong', async () => {
    const { summary, angler } = await registerSolo(db, await db.device('owner'), eventId);
    const thief = await db.device('thief');
    const wrongPhone = await db.call<{ claim_entry: unknown }>(thief, 'claim_entry', {
      p_code: codeOf(summary, angler.id),
      p_phone: '406-555-0000',
    });
    expect(rowOf(wrongPhone).claim_entry).toBeNull();
    const wrongCode = await db.call<{ claim_entry: unknown }>(thief, 'claim_entry', {
      p_code: 'XXXX',
      p_phone: angler.phone,
    });
    expect(rowOf(wrongCode).claim_entry).toBeNull();
  });

  it('slows down guessing to ten tries an hour per device', async () => {
    const guesser = await db.device('guesser');
    for (let i = 0; i < 10; i++) {
      expect(
        (await db.call(guesser, 'claim_entry', { p_code: '7K9X', p_phone: '406-555-0000' })).ok,
      ).toBe(true);
    }
    expect(
      errorOf(await db.call(guesser, 'claim_entry', { p_code: '7K9X', p_phone: '406-555-0000' })),
    ).toBe('too_many_attempts');
  });

  it('refuses a device that already holds a different entry, until it leaves it', async () => {
    const phone = await db.device('busy phone');
    const mine = await registerSolo(db, phone, eventId);
    const other = await registerSolo(db, await db.device('other'), eventId);
    const claim = () =>
      db.call(phone, 'claim_entry', {
        p_code: codeOf(other.summary, other.angler.id),
        p_phone: other.angler.phone,
      });
    expect(errorOf(await claim())).toBe('device_has_other_entry');
    rowsOf(await db.call(phone, 'leave_entry', { p_entry_id: mine.summary.entryId }));
    expect((await claim()).ok).toBe(true);
  });
});

describe('the director’s roster tools', () => {
  it('confirms a fee, and only the director can', async () => {
    const owner = await db.device('owner');
    const { summary } = await registerSolo(db, owner, eventId);
    expect(
      errorOf(
        await db.call(owner, 'director_set_fee_paid', {
          p_entry_id: summary.entryId,
          p_paid: true,
        }),
      ),
    ).toBe('director_only');
    rowsOf(
      await db.call(director, 'director_set_fee_paid', {
        p_entry_id: summary.entryId,
        p_paid: true,
      }),
    );
    const sql = `select fee_paid from public.entry_private where entry_id = $1`;
    expect(rowsOf(await db.as(owner, sql, [summary.entryId]))).toEqual([{ fee_paid: true }]);
  });

  it('disqualifies with a reason the angler can read, and reinstates', async () => {
    const owner = await db.device('owner');
    const { angler } = await registerSolo(db, owner, eventId);
    rowsOf(
      await db.call(director, 'director_disqualify', {
        p_angler_id: angler.id,
        p_reason: 'Out of bounds',
      }),
    );
    const stranger = await db.device('stranger');
    expect(
      rowsOf(
        await db.as(stranger, `select disqualified from public.anglers where id = $1`, [angler.id]),
      ),
    ).toEqual([{ disqualified: true }]);
    expect(
      rowsOf(
        await db.as(owner, `select dq_reason from public.angler_private where angler_id = $1`, [
          angler.id,
        ]),
      ),
    ).toEqual([{ dq_reason: 'Out of bounds' }]);
    rowsOf(await db.call(director, 'director_reinstate', { p_angler_id: angler.id }));
    expect(
      rowsOf(
        await db.as(stranger, `select disqualified from public.anglers where id = $1`, [angler.id]),
      ),
    ).toEqual([{ disqualified: false }]);
  });

  it('edits a profile, and still refuses a clash', async () => {
    const one = await registerSolo(db, await db.device('one'), eventId);
    const two = await registerSolo(db, await db.device('two'), eventId);
    const edit = (handle: string) =>
      db.call(director, 'director_update_angler', {
        p_angler_id: two.angler.id,
        p_full_name: two.angler.fullName,
        p_phone: two.angler.phone,
        p_handle: handle,
        p_big_fish: true,
        p_resident: false,
        p_emergency_name: 'Someone',
        p_emergency_phone: '406-555-0123',
      });
    expect(errorOf(await edit(one.angler.handle))).toBe('handle_taken');
    expect((await edit('Brand New Handle')).ok).toBe(true);
  });

  it('removes an entry and everything on it', async () => {
    const { summary } = await registerTeam(db, await db.device('leaving'), eventId);
    rowsOf(await db.call(director, 'director_remove_entry', { p_entry_id: summary.entryId }));
    expect(
      await db.admin(`select id from public.anglers where entry_id = $1`, [summary.entryId]),
    ).toEqual([]);
  });
});

describe('history across events', () => {
  it('finds the same person’s entries in other years by phone, and nobody else’s', async () => {
    const { eventId: lastYear } = await setUpEvent(db, { current: false, director });
    const me = registrant();
    const phone = await db.device('my phone');
    rowOf(await register(await db.device('old phone'), me, { event: lastYear }));
    rowOf(
      await register(phone, { ...me, id: randomUUID(), handle: 'A Different Handle This Year' }),
    );
    await registerSolo(db, await db.device('someone else'), lastYear);
    const ids = rowsOf(
      await db.call<{ my_history_angler_ids: string }>(phone, 'my_history_angler_ids'),
    ).map((r) => r.my_history_angler_ids);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(me.id);
  });

  it('hands the trophy case your anglers in every year, and only the days you finished', async () => {
    const { eventId: lastYear } = await setUpEvent(db, { current: false, director });
    const me = registrant();
    const phone = await db.device('trophy phone');
    rowOf(await register(await db.device('last year’s phone'), me, { event: lastYear }));
    // This year a team, with a partner who left the phone number blank.
    const captain = {
      ...me,
      id: randomUUID(),
      handle: `Trophy Captain ${randomUUID().slice(0, 4)}`,
    };
    const partner = registrant({ phone: '', emergencyName: '', emergencyPhone: '' });
    rowOf(await register(phone, captain, { partner }));
    const stranger = await registerSolo(db, await db.device('a stranger'), lastYear);

    const at = (hour: number) => `${DAY_1}T${String(hour).padStart(2, '0')}:00:00-06:00`;
    const set = (anglerId: string, day: string, out: string | null) =>
      db.call(director, 'director_set_check_in', {
        p_angler_id: anglerId,
        p_day: day,
        p_in_at: at(6),
        p_out_at: out,
      });
    rowOf(await set(me.id, DAY_1, at(15)));
    // Never checked back out: not a full day.
    rowOf(await set(me.id, DAY_2, null));
    rowOf(await set(stranger.angler.id, DAY_1, at(15)));

    const rows = rowsOf(
      await db.call<{ angler_id: string; event_id: string; full_days: (string | Date)[] }>(
        phone,
        'my_trophy_anglers',
      ),
    );
    const days = (v: (string | Date)[]) =>
      v.map((d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10)));
    expect(
      rows
        .map((r) => ({ id: r.angler_id, event: r.event_id, days: days(r.full_days) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      [
        { id: me.id, event: lastYear, days: [DAY_1] },
        { id: captain.id, event: eventId, days: [] },
        { id: partner.id, event: eventId, days: [] },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    // Last year's check-in times themselves stay out of reach of this phone.
    expect(
      rowsOf(await db.as(phone, `select * from public.check_ins where angler_id = $1`, [me.id])),
    ).toEqual([]);
    expect(rowsOf(await db.call(await db.device('nobody'), 'my_trophy_anglers'))).toEqual([]);
    expect((await db.call(db.anon, 'my_trophy_anglers')).ok).toBe(false);
  });
});
