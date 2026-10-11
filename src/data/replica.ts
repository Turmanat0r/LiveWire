// The phone's copy of the server's rows: every table, keyed by primary key.
// Pure functions over immutable maps, so React sees a new object exactly when
// something changed, and the sync engine can be tested without a server.
import type { Snapshot } from './local';
import { EVENT_TABLES, KEYS, rowKey, TABLE_NAMES, type Row, type TableName } from './tables';

export type TableMaps = { readonly [T in TableName]: ReadonlyMap<string, Row<T>> };

type MutableTableMaps = { -readonly [T in TableName]: ReadonlyMap<string, Row<T>> };

function keyed<T extends TableName>(table: T, rows: readonly Row<T>[]): Map<string, Row<T>> {
  return new Map(rows.map((row) => [rowKey(table, row), row]));
}

function withTable<T extends TableName>(
  tables: TableMaps,
  table: T,
  rows: ReadonlyMap<string, Row<T>>,
): TableMaps {
  const next: MutableTableMaps = { ...tables };
  (next as Record<T, ReadonlyMap<string, Row<T>>>)[table] = rows;
  return next;
}

export function emptyTables(): TableMaps {
  return fromSnapshot({});
}

export function fromSnapshot(tables: Snapshot['tables']): TableMaps {
  const out = {} as Record<TableName, ReadonlyMap<string, unknown>>;
  for (const table of TABLE_NAMES) {
    out[table] = keyed(table, (tables[table] ?? []) as readonly Row<typeof table>[]);
  }
  return out as unknown as TableMaps;
}

export function toSnapshot(tables: TableMaps): Snapshot['tables'] {
  const out: Partial<Record<TableName, readonly unknown[]>> = {};
  for (const table of TABLE_NAMES) out[table] = [...tables[table].values()];
  return out as Snapshot['tables'];
}

/** The table as the server just sent it, whole. */
export function replaceTable<T extends TableName>(
  tables: TableMaps,
  table: T,
  rows: readonly Row<T>[],
): TableMaps {
  return withTable(tables, table, keyed(table, rows));
}

/**
 * The rows whose `column` is one of `values`, as the server just sent them.
 * Any of them the server did not send back are gone, or this phone may no
 * longer see them: either way, off the phone.
 */
export function replaceMatching<T extends TableName>(
  tables: TableMaps,
  table: T,
  column: string,
  values: readonly (string | number)[],
  rows: readonly Row<T>[],
): TableMaps {
  const wanted = new Set<unknown>(values);
  const next = new Map(tables[table]);
  for (const [key, row] of next) {
    if (wanted.has((row as unknown as Readonly<Record<string, unknown>>)[column])) next.delete(key);
  }
  for (const row of rows) next.set(rowKey(table, row), row);
  return withTable(tables, table, next);
}

/** Everything but the list of events: the phone has moved to another event. */
export function withoutEventTables(tables: TableMaps): TableMaps {
  let next = tables;
  for (const table of EVENT_TABLES) next = replaceTable(next, table, []);
  return next;
}

/** The event every phone is on, if the director has chosen one. */
export function currentEvent(tables: TableMaps): Row<'events'> | null {
  for (const event of tables.events.values()) if (event.is_current) return event;
  return null;
}

/** Whether a signal's key can be refetched by one column, rather than the whole table. */
export function singleColumn(table: TableName, key: Readonly<Record<string, unknown>>) {
  const columns = Object.keys(key);
  const only = columns[0];
  return columns.length === 1 &&
    only !== undefined &&
    (KEYS[table] as readonly string[]).includes(only)
    ? only
    : null;
}
