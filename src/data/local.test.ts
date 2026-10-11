import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openLocal } from './local';

const photo = { bytes: new Uint8Array([1, 2, 3]).buffer, type: 'image/jpeg' };

describe('the phone’s own storage', () => {
  it('keeps the outbox in the order things were done, across a reopen', async () => {
    const name = `local-${crypto.randomUUID()}`;
    const first = await openLocal(name);
    expect(first.durable).toBe(true);
    for (const id of ['a', 'b', 'c']) {
      await first.addItem({ id, label: id, createdAt: 0, steps: [] }, {});
    }
    const reopened = await openLocal(name);
    expect((await reopened.outbox()).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps an item’s photo with it, and lets both go together', async () => {
    const local = await openLocal(`local-${crypto.randomUUID()}`);
    const item = await local.addItem({ id: 'c1', label: 'c1', createdAt: 0, steps: [] }, { photo });
    const other = await local.addItem(
      { id: 'c10', label: 'c10', createdAt: 0, steps: [] },
      { photo },
    );
    expect(new Uint8Array((await local.file('c1', 'photo'))?.bytes ?? [])).toEqual(
      new Uint8Array([1, 2, 3]),
    );

    await local.removeItem(item);
    expect(await local.file('c1', 'photo')).toBeUndefined();
    // Only that item's: c10 shares the prefix "c1" but keeps its photo.
    expect(await local.file(other.id, 'photo')).toBeDefined();
  });

  it('keeps the last copy of the event', async () => {
    const name = `local-${crypto.randomUUID()}`;
    await (
      await openLocal(name)
    ).saveSnapshot({ schema: 'v1', eventId: 'e1', tables: {}, savedAt: 42 });
    expect((await (await openLocal(name)).loadSnapshot())?.savedAt).toBe(42);
  });
});
