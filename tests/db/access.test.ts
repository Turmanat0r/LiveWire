// The shape of the whole database, checked from the catalog rather than one
// case at a time: so a table or function added later cannot quietly skip the
// rules the rest of the design depends on.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDb } from './harness';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.close();
});

const OURS = `'public', 'private'`;

describe('every table', () => {
  it('has row-level security switched on', async () => {
    const open = await db.admin<{ name: string }>(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(open).toEqual([]);
  });

  it('cannot be written directly by a phone, signed in or not', async () => {
    const writable = await db.admin<{
      grantee: string;
      table_name: string;
      privilege_type: string;
    }>(`
      select grantee, table_name, privilege_type from information_schema.role_table_grants
      where table_schema in (${OURS}) and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`);
    expect(writable).toEqual([]);
  });

  it('in the private schema cannot be read by a phone at all', async () => {
    const readable = await db.admin(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'private' and grantee in ('anon', 'authenticated')`);
    expect(readable).toEqual([]);
  });

  it('in public tells phones when its rows change', async () => {
    const silent = await db.admin<{ name: string }>(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (
          select 1 from pg_trigger t
          where t.tgrelid = c.oid and t.tgfoid = 'private.signal_change'::regproc
            and t.tgtype & 28 = 28 -- on insert (4), delete (8) and update (16)
        )`);
    expect(silent).toEqual([]);
  });
});

describe('every function', () => {
  it('that a phone can call runs with a fixed search path', async () => {
    const loose = await db.admin<{ name: string }>(`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in (${OURS})
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(loose).toEqual([]);
  });

  it('in public is closed to a phone that has not signed in', async () => {
    const open = await db.admin<{ name: string }>(`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(open).toEqual([]);
  });

  it('in private is closed to phones, apart from the checks row-level security makes', async () => {
    const open = await db.admin<{ name: string }>(`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
      order by 1`);
    expect(open.map((f) => f.name)).toEqual([
      'can_act_for',
      'can_add_photo',
      'can_remove_photo',
      'can_see_catch',
      'can_see_evidence',
      'can_see_photo',
      'is_director',
      'my_entry_ids',
    ]);
  });
});
