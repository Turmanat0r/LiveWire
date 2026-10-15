import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, rowOf, rowsOf, TestDb, type Caller } from './harness';
import { registerSolo, registerTeam, setUpEvent } from './fixtures';
import { eligibleEntries, paidEntries } from '../../src/domain/money';
import type { Angler } from '../../src/domain/types';
import { seededRandom } from '../../src/test/arbitraries';

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

async function angler() {
  const phone = await db.device('phone');
  const { angler: a } = await registerSolo(db, phone, eventId);
  return { phone, anglerId: a.id };
}

describe('chat', () => {
  it('posts as the device’s own angler, under their handle', async () => {
    const { phone, anglerId } = await angler();
    const message = rowOf(
      await db.call<{ handle: string; kind: string }>(phone, 'post_message', {
        p_id: randomUUID(),
        p_angler_id: anglerId,
        p_body: 'Fish on!',
      }),
    );
    expect(message.kind).toBe('chat');
    expect(message.handle).toMatch(/Salty Bedrock Perch/);
    expect(
      errorOf(
        await db.call(await db.device('impostor'), 'post_message', {
          p_id: randomUUID(),
          p_angler_id: anglerId,
          p_body: 'x',
        }),
      ),
    ).toBe('not_your_entry');
  });

  it('announces only the angler’s own catch', async () => {
    const mine = await angler();
    const theirs = await angler();
    const catchId = randomUUID();
    rowOf(
      await db.call(theirs.phone, 'file_catch', {
        p_id: catchId,
        p_angler_id: theirs.anglerId,
        p_species: 'Walleye',
        p_length_inches: 20,
        p_logged_at: new Date().toISOString(),
      }),
    );
    expect(
      errorOf(
        await db.call(mine.phone, 'post_message', {
          p_id: randomUUID(),
          p_angler_id: mine.anglerId,
          p_body: '',
          p_catch_id: catchId,
        }),
      ),
    ).toBe('not_your_catch');
    const brag = rowOf(
      await db.call<{ kind: string }>(theirs.phone, 'post_message', {
        p_id: randomUUID(),
        p_angler_id: theirs.anglerId,
        p_body: '',
        p_catch_id: catchId,
      }),
    );
    expect(brag.kind).toBe('catch');
  });

  it('lets the author or the director delete a message, nobody else', async () => {
    const { phone, anglerId } = await angler();
    const id = randomUUID();
    rowOf(
      await db.call(phone, 'post_message', { p_id: id, p_angler_id: anglerId, p_body: 'oops' }),
    );
    expect(errorOf(await db.call(await db.device('rival'), 'delete_message', { p_id: id }))).toBe(
      'not_your_message',
    );
    rowsOf(await db.call(director, 'delete_message', { p_id: id }));
    expect(await db.admin(`select id from public.messages where id = $1`, [id])).toEqual([]);
  });

  it('keeps threads one deep, and a deleted post takes its replies with it', async () => {
    const author = await angler();
    const other = await angler();
    const post = randomUUID();
    const reply = randomUUID();
    const replyToReply = randomUUID();
    const say = (who: typeof author, id: string, replyTo: string | null) =>
      db.call<{ reply_to: string | null }>(who.phone, 'post_message', {
        p_id: id,
        p_angler_id: who.anglerId,
        p_body: 'Nice one',
        p_reply_to: replyTo,
      });
    rowOf(await say(author, post, null));
    rowOf(await say(other, reply, post));
    expect(rowOf(await say(author, replyToReply, reply)).reply_to).toBe(post);
    rowsOf(await db.call(author.phone, 'delete_message', { p_id: post }));
    expect(
      await db.admin(`select id from public.messages where id = any($1::uuid[])`, [
        [post, reply, replyToReply],
      ]),
    ).toEqual([]);
    expect(errorOf(await say(other, randomUUID(), post))).toBe('message_not_found');
  });
});

describe('side bets', () => {
  const create = (who: Caller, anglerId: string, title = 'Smallest walleye') =>
    db.call<{ id: string }>(who, 'create_bet', {
      p_id: randomUUID(),
      p_angler_id: anglerId,
      p_title: title,
      p_scoring: 'smallest',
    });

  it('allows three open bets per angler', async () => {
    const { phone, anglerId } = await angler();
    for (let i = 0; i < 3; i++) rowOf(await create(phone, anglerId, `Bet ${i}`));
    expect(errorOf(await create(phone, anglerId))).toBe('too_many_open_bets');
  });

  it('is called by whoever started it, for somebody who is in it', async () => {
    const starter = await angler();
    const joiner = await angler();
    const outsider = await angler();
    const { id } = rowOf(await create(starter.phone, starter.anglerId));
    rowsOf(await db.call(joiner.phone, 'join_bet', { p_bet_id: id, p_angler_id: joiner.anglerId }));
    expect(
      errorOf(
        await db.call(joiner.phone, 'settle_bet', {
          p_bet_id: id,
          p_winner_angler_id: joiner.anglerId,
        }),
      ),
    ).toBe('not_your_entry');
    expect(
      errorOf(
        await db.call(starter.phone, 'settle_bet', {
          p_bet_id: id,
          p_winner_angler_id: outsider.anglerId,
        }),
      ),
    ).toBe('winner_not_in_bet');
    const settled = rowOf(
      await db.call<{ winner_angler_id: string }>(starter.phone, 'settle_bet', {
        p_bet_id: id,
        p_winner_angler_id: joiner.anglerId,
      }),
    );
    expect(settled.winner_angler_id).toBe(joiner.anglerId);
    expect(
      errorOf(
        await db.call(outsider.phone, 'join_bet', { p_bet_id: id, p_angler_id: outsider.anglerId }),
      ),
    ).toBe('bet_settled');
  });
});

describe('money', () => {
  it('records donations for the director only, and shows them to the field', async () => {
    const { phone } = await angler();
    const args = {
      p_id: randomUUID(),
      p_event_id: eventId,
      p_target: 'solo',
      p_amount_cents: 10_000,
    };
    expect(errorOf(await db.call(phone, 'director_record_donation', args))).toBe('director_only');
    rowOf(await db.call(director, 'director_record_donation', args));
    expect(
      rowsOf(
        await db.as(phone, `select amount_cents from public.donations where id = $1`, [args.p_id]),
      ),
    ).toEqual([{ amount_cents: 10_000 }]);
  });

  it('counts pools exactly as the payout rules do, for any mix of entries', async () => {
    const { eventId: poolEvent } = await setUpEvent(db, { current: false, director });
    const random = seededRandom(2027);
    const anglers: Angler[] = [];
    for (let i = 0; i < 14; i++) {
      const phone = await db.device('entrant');
      const team = random() < 0.4;
      const entry = team
        ? await registerTeam(db, phone, poolEvent)
        : await registerSolo(db, phone, poolEvent);
      const paid = random() < 0.6;
      if (paid)
        rowsOf(
          await db.call(director, 'director_set_fee_paid', {
            p_entry_id: entry.summary.entryId,
            p_paid: true,
          }),
        );
      for (const a of entry.summary.anglers) {
        const bigFish = random() < 0.5;
        const dq = random() < 0.25;
        if (bigFish)
          await db.admin(`update public.anglers set big_fish = true where id = $1`, [a.id]);
        if (dq)
          rowsOf(
            await db.call(director, 'director_disqualify', { p_angler_id: a.id, p_reason: 'test' }),
          );
        anglers.push({
          id: a.id,
          handle: a.handle,
          division: team ? 'team' : 'solo',
          role: a.role as Angler['role'],
          teamId: team ? entry.summary.entryId : null,
          bigFish,
          feePaid: paid,
          disqualified: dq,
        });
      }
    }
    const counts = rowOf(
      await db.call<Record<string, number>>(await db.device('anyone'), 'pool_counts', {
        p_event_id: poolEvent,
      }),
    );
    const paid = paidEntries(anglers);
    const eligible = eligibleEntries(anglers);
    expect(counts).toEqual({
      solo_paid: paid.solo,
      teams_paid: paid.teams,
      big_fish_paid: paid.bigFish,
      solo_eligible: eligible.solo,
      teams_eligible: eligible.teams,
    });
  });
});

describe('after the event', () => {
  it('freezes results for everyone to read, and only the director can', async () => {
    const { phone } = await angler();
    const record = { divisions: { solo: [] }, bigFish: null };
    expect(
      errorOf(
        await db.call(phone, 'director_freeze_results', { p_event_id: eventId, p_record: record }),
      ),
    ).toBe('director_only');
    rowOf(
      await db.call(director, 'director_freeze_results', { p_event_id: eventId, p_record: record }),
    );
    expect(
      rowsOf(
        await db.as(db.anon, `select record from public.results where event_id = $1`, [eventId]),
      ),
    ).toEqual([{ record }]);
  });

  it('keeps the state report for the director’s eyes', async () => {
    rowOf(
      await db.call(director, 'director_save_report', {
        p_event_id: eventId,
        p_settings: { filerName: 'Daniel' },
      }),
    );
    expect(
      rowsOf(await db.as(await db.device('nosy'), `select * from public.event_reports`)),
    ).toEqual([]);
  });

  it('clears a test event’s data and keeps its setup, then lets an empty one go', async () => {
    const { eventId: practice } = await setUpEvent(db, { current: false, director });
    const phone = await db.device('practice');
    await registerSolo(db, phone, practice);
    expect(
      errorOf(await db.call(director, 'director_delete_event', { p_event_id: practice })),
    ).toBe('event_has_entries');
    rowsOf(await db.call(director, 'director_clear_event', { p_event_id: practice }));
    expect(await db.admin(`select id from public.entries where event_id = $1`, [practice])).toEqual(
      [],
    );
    expect(
      await db.admin(`select day from public.event_days where event_id = $1`, [practice]),
    ).toHaveLength(2);
    rowsOf(await db.call(director, 'director_delete_event', { p_event_id: practice }));
    expect(await db.admin(`select id from public.events where id = $1`, [practice])).toEqual([]);
  });
});
