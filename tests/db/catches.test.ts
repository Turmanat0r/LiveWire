import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, rowOf, rowsOf, TestDb, type Caller } from './harness';
import { registerSolo, registerTeam, setUpEvent } from './fixtures';

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

interface CatchRow {
  id: string;
  angler_id: string;
  division: string;
  species: string;
  length_inches: string | number;
  status: string;
  photo_path: string;
}

async function angler() {
  const phone = await db.device('angler phone');
  const { angler: a } = await registerSolo(db, phone, eventId);
  return { phone, anglerId: a.id };
}

function file(who: Caller, anglerId: string, over: Record<string, unknown> = {}) {
  return db.call<CatchRow>(who, 'file_catch', {
    p_id: randomUUID(),
    p_angler_id: anglerId,
    p_species: 'Walleye',
    p_length_inches: 22.25,
    p_logged_at: new Date().toISOString(),
    p_lat: 46.39,
    p_lng: -111.57,
    p_boundary: { kind: 'circle', within: true, fromLaunchMiles: 0.5, outsideMiles: 0 },
    p_precheck: { hashes: ['ffffffffffffffff'], brightness: 120, sharpness: 80 },
    ...over,
  });
}

const visible = async (who: Caller, catchId: string) =>
  rowsOf(await db.as(who, `select id from public.catches where id = $1`, [catchId])).length === 1;
const evidenceVisible = async (who: Caller, catchId: string) =>
  rowsOf(
    await db.as(who, `select catch_id from public.catch_evidence where catch_id = $1`, [catchId]),
  ).length === 1;

describe('filing a catch', () => {
  it('files it pending, in the angler’s division, with a photo path of its own', async () => {
    const { phone, anglerId } = await angler();
    const id = randomUUID();
    const row = rowOf(await file(phone, anglerId, { p_id: id }));
    expect(row).toMatchObject({
      id,
      angler_id: anglerId,
      division: 'solo',
      status: 'pending',
      species: 'Walleye',
    });
    expect(Number(row.length_inches)).toBe(22.25);
    expect(row.photo_path).toBe(`${eventId}/${id}.jpg`);
  });

  it('files once however many times a phone with no signal sends it', async () => {
    const { phone, anglerId } = await angler();
    const id = randomUUID();
    const first = rowOf(await file(phone, anglerId, { p_id: id, p_length_inches: 20 }));
    const again = rowOf(await file(phone, anglerId, { p_id: id, p_length_inches: 35 }));
    expect(again).toEqual(first);
  });

  it('refuses a species the event does not have, and accepts Other', async () => {
    const { phone, anglerId } = await angler();
    expect(errorOf(await file(phone, anglerId, { p_species: 'Muskie' }))).toBe('unknown_species');
    expect((await file(phone, anglerId, { p_species: 'Other' })).ok).toBe(true);
    expect((await file(phone, anglerId, { p_species: 'Pike' })).ok).toBe(true);
  });

  it('refuses a time an hour in the future: the phone’s clock is wrong', async () => {
    const { phone, anglerId } = await angler();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(errorOf(await file(phone, anglerId, { p_logged_at: future }))).toBe('clock_ahead');
  });

  it('cannot be filed for somebody else’s entry', async () => {
    const { anglerId } = await angler();
    const stranger = await db.device('stranger');
    expect(errorOf(await file(stranger, anglerId))).toBe('not_your_entry');
  });

  it('lets a team captain’s phone file the partner’s fish, in the team division', async () => {
    const captainPhone = await db.device('captain');
    const { partner } = await registerTeam(db, captainPhone, eventId);
    const row = rowOf(await file(captainPhone, partner.id));
    expect(row.division).toBe('team');
  });

  it('lets the director file for anyone, and records that it was the director', async () => {
    const { anglerId } = await angler();
    const row = rowOf(await file(director, anglerId));
    const [evidence] = await db.admin<{ filed_by_director: boolean }>(
      `select filed_by_director from public.catch_evidence where catch_id = $1`,
      [row.id],
    );
    expect(evidence?.filed_by_director).toBe(true);
  });
});

describe('who sees a catch', () => {
  it('shows a pending catch to its angler and the director, not the field', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    const stranger = await db.device('stranger');
    expect([
      await visible(phone, id),
      await visible(director, id),
      await visible(stranger, id),
    ]).toEqual([true, true, false]);
  });

  it('shows an approved catch to the field, but never where it was caught', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    rowOf(await db.call(director, 'director_review_catch', { p_id: id, p_status: 'approved' }));
    const stranger = await db.device('stranger');
    expect(await visible(stranger, id)).toBe(true);
    expect(await evidenceVisible(stranger, id)).toBe(false);
    expect(await evidenceVisible(phone, id)).toBe(true);
  });

  it('keeps a rejected catch between the angler and the director', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    rowOf(
      await db.call(director, 'director_review_catch', {
        p_id: id,
        p_status: 'rejected',
        p_note: 'Tail off board',
      }),
    );
    expect(await visible(await db.device('stranger'), id)).toBe(false);
    const notes = rowsOf(
      await db.as(phone, `select review_note from public.catch_evidence where catch_id = $1`, [id]),
    );
    expect(notes).toEqual([{ review_note: 'Tail off board' }]);
  });
});

describe('changing a catch', () => {
  it('lets the angler fix the length while it is pending', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    const row = rowOf(
      await db.call<CatchRow>(phone, 'amend_catch_length', { p_id: id, p_length_inches: 23.5 }),
    );
    expect(Number(row.length_inches)).toBe(23.5);
  });

  it('locks it once the director has ruled', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    rowOf(await db.call(director, 'director_review_catch', { p_id: id, p_status: 'approved' }));
    expect(
      errorOf(await db.call(phone, 'amend_catch_length', { p_id: id, p_length_inches: 30 })),
    ).toBe('catch_already_reviewed');
    expect(errorOf(await db.call(phone, 'withdraw_catch', { p_id: id }))).toBe(
      'catch_already_reviewed',
    );
    const [row] = await db.admin<CatchRow>(`select * from public.catches where id = $1`, [id]);
    expect([row?.status, Number(row?.length_inches)]).toEqual(['approved', 22.25]);
  });

  it('withdraws a pending catch', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    rowsOf(await db.call(phone, 'withdraw_catch', { p_id: id }));
    expect(await db.admin(`select id from public.catches where id = $1`, [id])).toEqual([]);
  });

  it('keeps every ruling for the director alone', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    for (const [fn, args] of [
      ['director_review_catch', { p_id: id, p_status: 'approved' }],
      ['director_correct_catch', { p_id: id, p_species: 'Walleye', p_length_inches: 40 }],
      ['director_set_ai_review', { p_id: id, p_review: { clear: true } }],
      ['director_set_catch_boundary', { p_id: id, p_boundary: { kind: 'unchecked' } }],
    ] as const) {
      expect(errorOf(await db.call(phone, fn, args))).toBe('director_only');
    }
  });

  it('lets the director correct a misread board after approving it', async () => {
    const { phone, anglerId } = await angler();
    const { id } = rowOf(await file(phone, anglerId));
    rowOf(await db.call(director, 'director_review_catch', { p_id: id, p_status: 'approved' }));
    const row = rowOf(
      await db.call<CatchRow>(director, 'director_correct_catch', {
        p_id: id,
        p_species: 'Pike',
        p_length_inches: 31,
      }),
    );
    expect([row.species, Number(row.length_inches), row.status]).toEqual(['Pike', 31, 'approved']);
  });
});

describe('photos', () => {
  const upload = (who: Caller, path: string) =>
    db.as(
      who,
      `insert into storage.objects (bucket_id, name, owner) values ('catch-photos', $1, $2)`,
      [path, who.userId],
    );
  const canRemove = async (who: Caller, path: string) =>
    rowOf(
      await db.as<{ allowed: boolean }>(who, `select private.can_remove_photo($1) as allowed`, [
        path,
      ]),
    ).allowed;
  const seesPhoto = async (who: Caller, path: string) =>
    rowsOf(
      await db.as(
        who,
        `select name from storage.objects where bucket_id = 'catch-photos' and name = $1`,
        [path],
      ),
    ).length === 1;

  it('takes the photo for a pending catch the device filed, at its own path only', async () => {
    const { phone, anglerId } = await angler();
    const row = rowOf(await file(phone, anglerId));
    expect((await upload(phone, `${eventId}/${randomUUID()}.jpg`)).ok).toBe(false);
    expect((await upload(phone, row.photo_path)).ok).toBe(true);
  });

  it('refuses a photo for somebody else’s catch', async () => {
    const { phone, anglerId } = await angler();
    const row = rowOf(await file(phone, anglerId));
    expect((await upload(await db.device('stranger'), row.photo_path)).ok).toBe(false);
  });

  it('refuses a photo once the catch has been ruled on', async () => {
    const { phone, anglerId } = await angler();
    const row = rowOf(await file(phone, anglerId));
    rowOf(await db.call(director, 'director_review_catch', { p_id: row.id, p_status: 'approved' }));
    expect((await upload(phone, row.photo_path)).ok).toBe(false);
  });

  it('shows a photo to the field once approved, and lets nobody but the director remove it then', async () => {
    const { phone, anglerId } = await angler();
    const row = rowOf(await file(phone, anglerId));
    expect((await upload(phone, row.photo_path)).ok).toBe(true);
    const stranger = await db.device('stranger');
    expect([
      await seesPhoto(phone, row.photo_path),
      await seesPhoto(stranger, row.photo_path),
    ]).toEqual([true, false]);
    expect(await canRemove(phone, row.photo_path)).toBe(true);
    rowOf(await db.call(director, 'director_review_catch', { p_id: row.id, p_status: 'approved' }));
    expect(await seesPhoto(stranger, row.photo_path)).toBe(true);
    expect([
      await canRemove(phone, row.photo_path),
      await canRemove(director, row.photo_path),
    ]).toEqual([false, true]);
  });

  it('cannot be replaced: there is no rule that allows overwriting', async () => {
    const policies = await db.admin<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'catch_photos%'`,
    );
    expect(policies.map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT']);
  });
});
