// Every table a phone keeps a copy of, and the columns that pick out a row.
import type { Database } from './database.types';

type PublicTables = Database['public']['Tables'];
export type TableName = keyof PublicTables;
export type Row<T extends TableName> = PublicTables[T]['Row'];
export type FunctionName = keyof Database['public']['Functions'];
export type FunctionArgs<F extends FunctionName> = Database['public']['Functions'][F]['Args'];

/**
 * Each table's primary key, in the database's column order. Listing a table
 * twice, leaving one out or naming a column it lacks is a type error;
 * tests/db/live-updates.test.ts checks the keys against the database itself.
 */
export const KEYS = {
  events: ['id'],
  event_days: ['event_id', 'day'],
  event_species: ['event_id', 'name'],
  event_safety: ['event_id'],
  entries: ['id'],
  entry_private: ['entry_id'],
  anglers: ['id'],
  angler_private: ['angler_id'],
  entry_devices: ['entry_id', 'user_id'],
  check_ins: ['angler_id', 'day'],
  catches: ['id'],
  catch_evidence: ['catch_id'],
  positions: ['angler_id'],
  beacons: ['id'],
  messages: ['id'],
  bets: ['id'],
  bet_entries: ['bet_id', 'angler_id'],
  donations: ['id'],
  results: ['event_id'],
  event_reports: ['event_id'],
} as const satisfies { readonly [T in TableName]: readonly (keyof Row<T> & string)[] };

export const TABLE_NAMES = Object.keys(KEYS) as readonly TableName[];

/** Everything but the list of events belongs to one event and is read one event at a time. */
export const EVENT_TABLES: readonly Exclude<TableName, 'events'>[] = TABLE_NAMES.filter(
  (t): t is Exclude<TableName, 'events'> => t !== 'events',
);

export function isTableName(name: unknown): name is TableName {
  return typeof name === 'string' && Object.hasOwn(KEYS, name);
}

/** One string per row, from its primary key. */
export function rowKey<T extends TableName>(table: T, row: Row<T>): string {
  const columns: readonly string[] = KEYS[table];
  const values = row as unknown as Readonly<Record<string, unknown>>;
  return JSON.stringify(columns.map((c) => values[c]));
}
