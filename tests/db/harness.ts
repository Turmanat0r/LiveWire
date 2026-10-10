// The database under test, and the people who use it.
//
// Two ways to get a database, one set of tests:
//
//   - By default, a fresh Postgres inside this process (PGlite), set up the way
//     Supabase sets one up (its roles, auth.uid(), the storage tables, the
//     default grants) and then every migration in supabase/migrations applied
//     in order. Nothing to install, and no admin rights.
//   - With SUPABASE_DB_URL set, the real thing: CI starts the Supabase stack,
//     applies the migrations, and points the same tests at it. That is the
//     check that the stand-in above has not drifted from Supabase.
//
// Each test acts as somebody - an angler's phone, a teammate's phone, a
// stranger, the director, or a phone not signed in - the way Supabase does it:
// a transaction with the role and the signed-in user's claims set locally.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);

interface Connection {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

// What Supabase provides before any migration runs, as far as these
// migrations rely on it.
const SUPABASE_STAND_IN = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    is_anonymous boolean not null default false,
    raw_app_meta_data jsonb not null default '{}',
    created_at timestamptz not null default now()
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text, owner uuid,
    created_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  grant select on storage.buckets to anon, authenticated, service_role;

  create publication supabase_realtime;
`;

async function openPglite(): Promise<Connection> {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${String(error)}`, { cause: error });
    }
  }
  return {
    query: async (sql, params) => ({
      rows: (await db.query<Record<string, unknown>>(sql, params)).rows,
    }),
    exec: async (sql) => {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}

async function openSupabase(url: string): Promise<Connection> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    query: async (sql, params) => ({
      rows: (await client.query(sql, params)).rows as Record<string, unknown>[],
    }),
    exec: async (sql) => {
      await client.query(sql);
    },
    close: () => client.end(),
  };
}

export interface DbError {
  /** The stable key the functions raise, such as 'registration_closed'. */
  readonly message: string;
  /** The SQLSTATE, such as '42501' for "not allowed". */
  readonly code: string;
  readonly detail?: string;
}

export type Result<T> =
  { readonly ok: true; readonly rows: T[] } | { readonly ok: false; readonly error: DbError };

/** Somebody using the database. */
export interface Caller {
  readonly label: string;
  readonly role: 'anon' | 'authenticated';
  readonly userId: string | null;
  readonly director: boolean;
}

function toDbError(error: unknown): DbError {
  const e = error as { message?: unknown; code?: unknown; detail?: unknown };
  return {
    message: typeof e.message === 'string' ? e.message : String(error),
    code: typeof e.code === 'string' ? e.code : '',
    ...(typeof e.detail === 'string' ? { detail: e.detail } : {}),
  };
}

export class TestDb {
  private readonly conn: Connection;

  private constructor(conn: Connection) {
    this.conn = conn;
  }

  static async open(): Promise<TestDb> {
    const url = process.env['SUPABASE_DB_URL'];
    return new TestDb(url ? await openSupabase(url) : await openPglite());
  }

  close(): Promise<void> {
    return this.conn.close();
  }

  /** As the database owner, as the SQL editor and migrations run. */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.conn.query(sql, params)).rows as T[];
  }

  /** A signed-in phone: an anonymous Supabase user. */
  async device(label: string): Promise<Caller> {
    const id = randomUUID();
    await this.admin(`insert into auth.users (id, is_anonymous) values ($1, true)`, [id]);
    return { label, role: 'authenticated', userId: id, director: false };
  }

  /** The tournament director: a signed-in account with director on its app_metadata. */
  async director(): Promise<Caller> {
    const id = randomUUID();
    await this.admin(`insert into auth.users (id, is_anonymous) values ($1, false)`, [id]);
    return { label: 'director', role: 'authenticated', userId: id, director: true };
  }

  /** A phone that has not signed in at all. */
  readonly anon: Caller = { label: 'anon', role: 'anon', userId: null, director: false };

  /** Run SQL as somebody, in one transaction, the way a request through the API does. */
  async as<T = Record<string, unknown>>(
    who: Caller,
    sql: string,
    params: unknown[] = [],
  ): Promise<Result<T>> {
    const claims = who.userId
      ? {
          sub: who.userId,
          role: who.role,
          is_anonymous: !who.director,
          app_metadata: who.director ? { director: true } : {},
        }
      : { role: who.role };
    await this.conn.exec('begin');
    try {
      await this.conn.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(claims),
      ]);
      await this.conn.exec(`set local role ${who.role}`);
      const { rows } = await this.conn.query(sql, params);
      await this.conn.exec('commit');
      return { ok: true, rows: rows as T[] };
    } catch (error) {
      await this.conn.exec('rollback');
      return { ok: false, error: toDbError(error) };
    }
  }

  /**
   * Call a function in `public` by name with named arguments, as the API does:
   * call(angler, 'check_in', { p_angler_id, p_day }).
   */
  call<T = Record<string, unknown>>(
    who: Caller,
    fn: string,
    args: Record<string, unknown> = {},
  ): Promise<Result<T>> {
    if (!/^[a-z_]+$/.test(fn)) throw new Error(`Not a function name: ${fn}`);
    const names = Object.keys(args);
    names.forEach((n) => {
      if (!/^p_[a-z_]+$/.test(n)) throw new Error(`Not an argument name: ${n}`);
    });
    const list = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
    return this.as<T>(who, `select * from public.${fn}(${list})`, Object.values(args).map(toParam));
  }
}

function toParam(value: unknown): unknown {
  return value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !Array.isArray(value)
    ? JSON.stringify(value)
    : value;
}

/** The rows of a call that had to succeed. */
export function rowsOf<T>(result: Result<T>): T[] {
  if (!result.ok)
    throw new Error(`Expected success, got ${result.error.message}: ${result.error.detail ?? ''}`);
  return result.rows;
}

/** The one row of a call that had to succeed. */
export function rowOf<T>(result: Result<T>): T {
  const [row] = rowsOf(result);
  if (row === undefined) throw new Error('Expected a row, got none');
  return row;
}

/** The error key of a call that had to fail. */
export function errorOf(result: Result<unknown>): string {
  if (result.ok) throw new Error(`Expected a failure, got ${JSON.stringify(result.rows)}`);
  return result.error.message;
}
