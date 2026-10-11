// The app's database types are generated from staging, not written by hand.
// This checks they still describe the database the migrations build: same
// tables, same functions, same value lists. A migration merged without
// regenerating them fails here, naming what is missing.
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDb } from './harness';
import { Constants } from '../../src/data/database.types';

const TYPES_FILE = fileURLToPath(new URL('../../src/data/database.types.ts', import.meta.url));

/** The property names of Database['public'][section], read by the compiler. */
function namesIn(section: 'Tables' | 'Functions'): string[] {
  const program = ts.createProgram([TYPES_FILE], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(TYPES_FILE);
  const alias = source?.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === 'Database',
  );
  if (!alias) throw new Error('database.types.ts has no Database type');
  const property = (type: ts.Type, name: string): ts.Type => {
    const symbol = type.getProperty(name);
    if (!symbol) throw new Error(`Database has no ${name}`);
    return checker.getTypeOfSymbolAtLocation(symbol, alias);
  };
  const publicSchema = property(checker.getTypeAtLocation(alias.name), 'public');
  return property(publicSchema, section)
    .getProperties()
    .map((p) => p.name)
    .sort();
}

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.close();
});

describe('the generated database types', () => {
  it('list every table', async () => {
    const tables = await db.admin<{ name: string }>(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(namesIn('Tables')).toEqual(tables.map((t) => t.name));
  });

  it('list every function', async () => {
    const functions = await db.admin<{ name: string }>(`
      select distinct p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by 1`);
    expect(namesIn('Functions')).toEqual(functions.map((f) => f.name));
  });

  it('carry every value of every list, in order', async () => {
    const rows = await db.admin<{ type: string; label: string }>(`
      select t.typname as type, e.enumlabel as label
      from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' order by t.typname, e.enumsortorder`);
    const fromDb: Record<string, string[]> = {};
    for (const { type, label } of rows) (fromDb[type] ??= []).push(label);
    expect(Constants.public.Enums).toEqual(fromDb);
  });
});
