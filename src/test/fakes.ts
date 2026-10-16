// Stand-ins for the server and the clock, for testing the sync engine and the
// outbox without a network.
import {
  RemoteError,
  type Account,
  type Json,
  type LiveStatus,
  type Remote,
  type Signal,
} from '../data/remote';
import type { StoredFile } from '../data/remote';
import { rowKey, type FunctionName, type Row, type TableName } from '../data/tables';

type AnyRow = Readonly<Record<string, unknown>>;

interface Listener {
  readonly topics: readonly string[];
  readonly onSignal: (signal: Signal) => void;
  readonly onStatus: (status: LiveStatus) => void;
  stopped: boolean;
}

/** A server in memory. Tests change its rows, cut its signal, and make it refuse. */
export class FakeServer implements Remote {
  online = true;
  /** Who may see what; everything, unless a test says otherwise. Plays row-level security. */
  canSee: (table: TableName, row: AnyRow) => boolean = () => true;
  /** Answers for functions; a function with no answer returns null. */
  readonly answers = new Map<FunctionName, (args: Readonly<Record<string, Json>>) => Json>();
  readonly calls: { fn: FunctionName; args: Readonly<Record<string, Json>> }[] = [];
  readonly uploads = new Map<string, StoredFile>();
  readonly removed: string[] = [];
  readonly reads: string[] = [];
  signInsRefused: string | null = null;
  signIns = 0;
  private readonly rows = new Map<TableName, Map<string, AnyRow>>();
  private readonly listeners: Listener[] = [];

  /** Puts a row on the server without telling anyone, as if before the phone connected. */
  put<T extends TableName>(table: T, row: Row<T>): void {
    const rows = this.rows.get(table) ?? new Map<string, AnyRow>();
    rows.set(rowKey(table, row), row);
    this.rows.set(table, rows);
  }

  remove<T extends TableName>(table: T, row: Row<T>): void {
    this.rows.get(table)?.delete(rowKey(table, row));
  }

  /** Sends a signal to every phone listening on the topic. */
  signal(topic: string, signal: Signal): void {
    for (const l of this.listeners) if (!l.stopped && l.topics.includes(topic)) l.onSignal(signal);
  }

  /** Reports a status to every phone listening. */
  status(status: LiveStatus): void {
    for (const l of this.listeners) if (!l.stopped) l.onStatus(status);
  }

  /** The topics phones are listening on now. */
  listening(): string[] {
    return this.listeners.filter((l) => !l.stopped).flatMap((l) => l.topics);
  }

  private reachable(): void {
    if (!this.online) throw new RemoteError({ kind: 'offline' });
  }

  /** The account this phone is signed in to. */
  account: Account = { id: 'device-1', director: false, email: null };
  /** Director accounts by email, with their passwords. */
  readonly directors = new Map<string, string>();

  signIn(): Promise<Account> {
    this.reachable();
    if (this.signInsRefused) {
      return Promise.reject(
        new RemoteError({ kind: 'refused', key: 'sign_in', detail: this.signInsRefused }),
      );
    }
    this.signIns += 1;
    return Promise.resolve(this.account);
  }

  signInDirector(email: string, password: string): Promise<Account> {
    this.reachable();
    if (this.directors.get(email) !== password) {
      return Promise.reject(
        new RemoteError({
          kind: 'refused',
          key: 'invalid_credentials',
          detail: 'Invalid login credentials',
        }),
      );
    }
    this.account = { id: 'director-1', director: true, email };
    return Promise.resolve(this.account);
  }

  signOut(): Promise<Account> {
    this.reachable();
    this.account = { id: 'device-2', director: false, email: null };
    return Promise.resolve(this.account);
  }

  readTable<T extends TableName>(table: T, eventId: string | null): Promise<Row<T>[]> {
    this.reachable();
    this.reads.push(`${table} ${eventId ?? 'all'}`);
    return Promise.resolve(
      this.visible(table).filter((row) => eventId === null || row['event_id'] === eventId),
    ) as Promise<Row<T>[]>;
  }

  readMatching<T extends TableName>(
    table: T,
    column: string,
    values: readonly (string | number)[],
  ): Promise<Row<T>[]> {
    this.reachable();
    this.reads.push(`${table} ${column}=${values.join(',')}`);
    return Promise.resolve(
      this.visible(table).filter((row) => values.includes(row[column] as string | number)),
    ) as Promise<Row<T>[]>;
  }

  call(fn: FunctionName, args: Readonly<Record<string, Json>>): Promise<Json> {
    this.reachable();
    this.calls.push({ fn, args });
    try {
      return Promise.resolve(this.answers.get(fn)?.(args) ?? null);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  upload(path: string, file: StoredFile): Promise<void> {
    this.reachable();
    this.uploads.set(path, file);
    return Promise.resolve();
  }

  removePhoto(path: string): Promise<void> {
    this.reachable();
    this.uploads.delete(path);
    this.removed.push(path);
    return Promise.resolve();
  }

  /** The time on the phone, as the test runs it. */
  phoneClock: () => number = Date.now;
  /** Server minus phone; a test sets it to try a phone whose clock is off. */
  clockAheadMs = 0;

  serverTime(): Promise<number> {
    this.reachable();
    return Promise.resolve(this.phoneClock() + this.clockAheadMs);
  }

  photoUrl(path: string): Promise<string> {
    this.reachable();
    return Promise.resolve(`https://photos.test/${path}`);
  }

  listen(
    topics: readonly string[],
    onSignal: (signal: Signal) => void,
    onStatus: (status: LiveStatus) => void,
  ): () => void {
    const listener: Listener = { topics, onSignal, onStatus, stopped: false };
    this.listeners.push(listener);
    onStatus('joining');
    return () => {
      listener.stopped = true;
    };
  }

  private visible(table: TableName): AnyRow[] {
    return [...(this.rows.get(table)?.values() ?? [])].filter((row) => this.canSee(table, row));
  }
}

/** A refusal, as the server's functions raise them. */
export function refusal(key: string, detail = `Refused: ${key}`): RemoteError {
  return new RemoteError({ kind: 'refused', key, detail });
}

/** Timers that run only when a test moves the clock. */
export class ManualTimers {
  now = 0;
  private next = 0;
  private readonly pending = new Map<number, { at: number; run: () => void }>();

  setTimer = (run: () => void, ms: number): (() => void) => {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, run });
    return () => {
      this.pending.delete(id);
    };
  };

  /** The waits still set, soonest first, in milliseconds from now. */
  waits(): number[] {
    return [...this.pending.values()].map((t) => t.at - this.now).sort((a, b) => a - b);
  }

  /** Moves the clock on, running every timer that falls due, with the work each one starts. */
  async advance(ms: number): Promise<void> {
    const until = this.now + ms;
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, t]) => t.at <= until)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.pending.delete(id);
      this.now = timer.at;
      timer.run();
      await settle();
    }
    this.now = until;
    await settle();
  }
}

/** Lets every promise already under way run to completion. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
