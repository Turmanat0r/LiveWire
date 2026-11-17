// The server is Supabase, reached through its official client. This file is
// the only one that knows that: it turns the client's answers into rows, and
// its errors into the four kinds of failure in remote.ts.
import {
  createClient,
  isAuthRetryableFetchError,
  REALTIME_SUBSCRIBE_STATES,
  StorageApiError,
  type AuthError,
  type PostgrestError,
  type RealtimeChannel,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
  RemoteError,
  type Account,
  type Failure,
  type Json,
  type LiveStatus,
  type Remote,
  type Signal,
  type StoredFile,
} from './remote';
import type { ServerConfig } from './config';
import { isTableName, KEYS, type FunctionName, type Row, type TableName } from './tables';

const BUCKET = 'catch-photos';
/** How long a photo address works. The phone asks again after this. */
export const PHOTO_URL_SECONDS = 3600;
/** PostgREST's default cap on rows per request. */
const PAGE = 1000;
/** Ids per request when reading rows by id, keeping the address well under server limits. */
const IDS_PER_REQUEST = 100;

// supabase-js types each request by its literal table name. The sync engine
// reads every table the same way, so it goes through this narrower view of
// the client; rows come back typed by the table's generated Row type.
interface Response {
  readonly data: unknown;
  readonly error: PostgrestError | null;
  readonly status: number;
}
interface Query extends PromiseLike<Response> {
  eq(column: string, value: unknown): Query;
  in(column: string, values: readonly unknown[]): Query;
  order(column: string): Query;
  range(from: number, to: number): Query;
}
interface AnyTable {
  from(table: string): { select(columns: string): Query };
  rpc(fn: string, args: object): PromiseLike<Response>;
}

/** What an HTTP answer means for the phone: wait for signal, try later, sign in again, or give up. */
export function httpFailure(status: number, key: string, detail: string): Failure {
  if (status === 0) return { kind: 'offline' };
  if (status === 401) return { kind: 'signed-out' };
  if (status === 408 || status === 429 || status >= 500) return { kind: 'unavailable', status };
  return { kind: 'refused', key, detail };
}

function postgrestFailure(error: PostgrestError, status: number): RemoteError {
  // The database's own refusals put a stable key in the message and a
  // sentence for people in the detail (see supabase/migrations). "There is
  // no such thing" is raised as SQLSTATE P0002, which PostgREST answers with
  // a 500 as if the server had failed; it is a refusal like any other, and
  // read as one, so the outbox never retries it for ever.
  if (error.code === 'P0002') {
    return new RemoteError({ kind: 'refused', key: error.message, detail: error.details });
  }
  return new RemoteError(httpFailure(status, error.message, error.details));
}

function authFailure(error: AuthError): RemoteError {
  if (isAuthRetryableFetchError(error)) return new RemoteError({ kind: 'offline' });
  return new RemoteError(
    httpFailure(error.status ?? 0, error.code ?? 'sign_in_failed', error.message),
  );
}

function rows<T extends TableName>(response: Response): Row<T>[] {
  if (response.error) throw postgrestFailure(response.error, response.status);
  return Array.isArray(response.data) ? (response.data as Row<T>[]) : [];
}

/** A signal as the database sends it, checked, since anything could arrive on a socket. */
export function parseSignal(payload: unknown): Signal | null {
  if (typeof payload !== 'object' || payload === null) return null;
  if (!('table' in payload) || !('key' in payload)) return null;
  const { table, key } = payload;
  if (!isTableName(table) || typeof key !== 'object' || key === null) return null;
  const allowed: readonly string[] = KEYS[table];
  const out: Record<string, string | number> = {};
  for (const [column, value] of Object.entries(key)) {
    if (!allowed.includes(column)) return null;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    out[column] = value;
  }
  return Object.keys(out).length > 0 ? { table, key: out } : null;
}

/** The director flag lives in the account's app metadata, which only the server can set. */
function accountOf(user: User): Account {
  return {
    id: user.id,
    director: user.app_metadata['director'] === true,
    email: user.is_anonymous ? null : (user.email ?? null),
  };
}

/** Runs one sign-in at a time across every tab, so a phone never makes two accounts. */
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request('livewire-sign-in', task);
  }
  return task();
}

class SupabaseRemote implements Remote {
  private readonly client: SupabaseClient<Database>;
  private readonly tables: AnyTable;
  private signingIn: Promise<Account> | null = null;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
    this.tables = client as unknown as AnyTable;
  }

  signIn(): Promise<Account> {
    this.signingIn ??= oneAtATime(() => this.signInNow()).finally(() => {
      this.signingIn = null;
    });
    return this.signingIn;
  }

  async accessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  private async signInNow(): Promise<Account> {
    // A stored sign-in that could not be refreshed (no signal) is an error
    // here, not an empty session: signing in afresh would cut the phone off
    // from the entries it holds.
    const { data, error } = await this.client.auth.getSession();
    if (error) throw authFailure(error);
    if (data.session) return accountOf(data.session.user);
    return this.anonymous();
  }

  private async anonymous(): Promise<Account> {
    const created = await this.client.auth.signInAnonymously();
    if (created.error) throw authFailure(created.error);
    const user = created.data.user;
    if (!user) throw new RemoteError({ kind: 'offline' });
    return accountOf(user);
  }

  async signInDirector(email: string, password: string): Promise<Account> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw authFailure(error);
    const account = accountOf(data.user);
    if (account.director) return account;
    await this.signOut();
    throw new RemoteError({
      kind: 'refused',
      key: 'not_director',
      detail: 'That account is not the tournament director’s.',
    });
  }

  async signOut(): Promise<Account> {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw authFailure(error);
    return this.anonymous();
  }

  async readTable<T extends TableName>(table: T, eventId: string | null): Promise<Row<T>[]> {
    const out: Row<T>[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = this.tables.from(table).select('*');
      if (eventId !== null) query = query.eq('event_id', eventId);
      for (const column of KEYS[table]) query = query.order(column);
      const page = rows<T>(await query.range(from, from + PAGE - 1));
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }

  async readMatching<T extends TableName>(
    table: T,
    column: string,
    values: readonly (string | number)[],
  ): Promise<Row<T>[]> {
    const out: Row<T>[] = [];
    for (let i = 0; i < values.length; i += IDS_PER_REQUEST) {
      const some = values.slice(i, i + IDS_PER_REQUEST);
      out.push(...rows<T>(await this.tables.from(table).select('*').in(column, some)));
    }
    return out;
  }

  async call(fn: FunctionName, args: Readonly<Record<string, Json>>): Promise<Json> {
    const { data, error, status } = await this.tables.rpc(fn, args);
    if (error) throw postgrestFailure(error, status);
    return (data ?? null) as Json;
  }

  async upload(path: string, file: StoredFile): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(path, new Blob([file.bytes], { type: file.type }), {
        contentType: file.type,
        upsert: false,
        // A photo never changes once filed, so a phone can keep it for good.
        cacheControl: '31536000',
      });
    if (!error) return;
    if (!(error instanceof StorageApiError)) throw new RemoteError({ kind: 'offline' });
    const status = error.status;
    if (status === 409 || error.statusCode === '409' || error.code === 'ResourceAlreadyExists') {
      return; // Stored by an earlier try whose answer never arrived.
    }
    throw new RemoteError(httpFailure(status, error.code ?? 'photo_refused', error.message));
  }

  async removePhoto(path: string): Promise<void> {
    // Removing what is not there is not an error to storage, which suits:
    // a retry after a lost answer finds the photo already gone.
    const { error } = await this.client.storage.from(BUCKET).remove([path]);
    if (!error) return;
    if (!(error instanceof StorageApiError)) throw new RemoteError({ kind: 'offline' });
    throw new RemoteError(httpFailure(error.status, error.code ?? 'photo_refused', error.message));
  }

  async serverTime(): Promise<number> {
    const { data, error, status } = await this.tables.rpc('server_now', {});
    if (error) throw postgrestFailure(error, status);
    const at = typeof data === 'string' ? Date.parse(data) : Number.NaN;
    if (Number.isNaN(at)) throw new RemoteError({ kind: 'unavailable', status });
    return at;
  }

  async photoUrl(path: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(path, PHOTO_URL_SECONDS);
    if (error) {
      if (!(error instanceof StorageApiError)) throw new RemoteError({ kind: 'offline' });
      throw new RemoteError(
        httpFailure(error.status, error.code ?? 'photo_refused', error.message),
      );
    }
    return data.signedUrl;
  }

  listen(
    topics: readonly string[],
    onSignal: (signal: Signal) => void,
    onStatus: (status: LiveStatus) => void,
  ): () => void {
    // An object, not a variable: the stop function below flips it while the
    // joining is still under way.
    const listening = { stopped: false };
    const joined = new Set<string>();
    const channels: RealtimeChannel[] = topics.map((topic) =>
      this.client
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'change' }, (message: { payload?: unknown }) => {
          if (listening.stopped) return;
          const signal = parseSignal(message.payload);
          if (signal) onSignal(signal);
        }),
    );
    onStatus('joining');
    void (async () => {
      try {
        // Private channels check who is asking, so the socket needs the sign-in first.
        await this.client.realtime.setAuth();
      } catch {
        if (!listening.stopped) onStatus('lost');
        return;
      }
      channels.forEach((channel, i) => {
        const topic = topics[i] ?? '';
        channel.subscribe((status) => {
          if (listening.stopped) return;
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            joined.add(topic);
            if (joined.size === topics.length) onStatus('live');
          } else {
            joined.delete(topic);
            onStatus('lost');
          }
        });
      });
    })();
    return () => {
      listening.stopped = true;
      for (const channel of channels) void this.client.removeChannel(channel);
    };
  }
}

export function supabaseRemote(config: ServerConfig): Remote {
  const client = createClient<Database>(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'livewire-session',
    },
  });
  return new SupabaseRemote(client);
}
