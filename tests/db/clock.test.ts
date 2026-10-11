import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rowOf, TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.close();
});

describe('the server clock', () => {
  it('tells a signed-in phone the time, for checking its own clock', async () => {
    const phone = await db.device('phone');
    const before = Date.now();
    const { server_now: at } = rowOf(await db.call<{ server_now: string }>(phone, 'server_now'));
    expect(Math.abs(Date.parse(at) - before)).toBeLessThan(60_000);
  });

  it('is not open to a phone that has not signed in', async () => {
    expect((await db.call(db.anon, 'server_now')).ok).toBe(false);
  });
});
