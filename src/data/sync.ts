// The sync engine: keeps the phone's copy of the tournament up to date, and
// the outbox moving.
//
//   1. Open with the copy saved last time, so the app works with no signal.
//   2. With signal: sign the phone in, listen for signals on the event's
//      topic, and read the event afresh. Every time listening (re)starts,
//      read afresh again, because signals sent while away are not replayed.
//   3. On a signal, read again just the rows it names (or the whole table, if
//      many changed at once), a quarter-second later so a burst is one read.
//   4. Save the copy a moment after it changes.
//
// No polling: with signal and nothing happening, nothing is downloaded.
import type { ClockReading, LocalStore, NewOutboxItem } from './local';
import { Outbox, type OutboxState } from './outbox';
import {
  failureOf,
  RemoteError,
  type Account,
  type Json,
  type LiveStatus,
  type Remote,
  type Signal,
  type StoredFile,
} from './remote';
import {
  currentEvent,
  emptyTables,
  fromSnapshot,
  replaceMatching,
  replaceTable,
  singleColumn,
  toSnapshot,
  withoutEventTables,
  type TableMaps,
} from './replica';
import { EVENT_TABLES, type FunctionName, type Row, type TableName } from './tables';

export type Connection =
  /** Built without a server to talk to. */
  | 'unconfigured'
  /** No signal. */
  | 'offline'
  /** Signing in, or reading the event for the first time. */
  | 'connecting'
  /** Listening: changes arrive as they happen. */
  | 'live'
  /** Lost the live connection; trying again, and catching up when it returns. */
  | 'reconnecting'
  /** The server would not sign this phone in. */
  | 'refused';

export interface SyncState {
  /** False until the saved copy has been read: render nothing rather than "no event". */
  readonly loaded: boolean;
  readonly tables: TableMaps;
  readonly event: Row<'events'> | null;
  /** When the copy last matched the server, or null if it never has on this phone. */
  readonly syncedAt: number | null;
  readonly connection: Connection;
  /** Why the server refused, in words, when connection is 'refused'. */
  readonly problem: string | null;
  readonly outbox: OutboxState;
  /** False when this browser cannot keep anything after the app closes. */
  readonly durable: boolean;
  /** This phone's account on the server, once known; kept with the saved copy. */
  readonly userId: string | null;
  /** Signed in as the tournament director; kept with the saved copy. */
  readonly director: boolean;
  /** The director's sign-in email, to show who is signed in. */
  readonly email: string | null;
  /** How far this phone's clock is off, as last measured; kept with the saved copy. */
  readonly clock: ClockReading | null;
}

export interface SyncOptions {
  readonly remote: Remote | null;
  readonly local: Promise<LocalStore>;
  /** The database version this build expects; a saved copy from another is not used. */
  readonly schema: string;
  readonly now?: () => number;
  readonly online?: () => boolean;
  readonly random?: () => number;
  readonly setTimer?: (run: () => void, ms: number) => () => void;
  readonly exclusive?: (send: () => Promise<void>) => Promise<void>;
}

/** Signals gathered this long before reading, so a burst of changes is one read. */
const GATHER_MS = 250;
/** A table read whole rather than row by row once this many of its rows changed. */
const MANY = 50;
const SAVE_AFTER_MS = 1000;
const FIRST_RETRY_MS = 2_000;
const LAST_RETRY_MS = 60_000;
/**
 * Supabase starts relaying signals a few seconds after the first phone of the
 * day joins. A change in that gap is announced to nobody, so the event is read
 * once more this long after joining.
 */
const RELAY_STARTS_MS = 5_000;
/** Hidden longer than this, the app reads everything again when it comes back. */
const STALE_AFTER_HIDDEN_MS = 60_000;
/** Photo addresses last an hour; ask for a fresh one after fifty minutes. */
const PHOTO_URL_REUSE_MS = 50 * 60_000;

function browserTimer(run: () => void, ms: number): () => void {
  const id = setTimeout(run, ms);
  return () => {
    clearTimeout(id);
  };
}

type Pending = 'all' | Map<string, Set<string | number>>;

export class Sync {
  readonly outbox: Outbox;
  private readonly remote: Remote | null;
  private readonly local: Promise<LocalStore>;
  private readonly schema: string;
  private readonly now: () => number;
  private readonly online: () => boolean;
  private readonly random: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  private readonly listeners = new Set<() => void>();
  private state: SyncState;

  private stopListening: (() => void) | null = null;
  /** The event whose topic we listen on. */
  private listeningTo: string | null = null;
  /** Every channel joined, as last reported. */
  private live = false;
  private hiddenAt: number | null = null;
  private connecting = false;
  private stopped = false;
  private failuresInARow = 0;
  private cancelRetry: (() => void) | null = null;
  private cancelSave: (() => void) | null = null;
  private cancelGather: (() => void) | null = null;
  private cancelSecondLook: (() => void) | null = null;
  private readonly pending = new Map<TableName, Pending>();
  /** One read at a time per table, so an older answer never lands on a newer one. */
  private readonly reads = new Map<TableName, Promise<void>>();

  constructor(options: SyncOptions) {
    this.remote = options.remote;
    this.local = options.local;
    this.schema = options.schema;
    this.now = options.now ?? Date.now;
    this.online = options.online ?? (() => navigator.onLine);
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? browserTimer;
    this.outbox = new Outbox({
      local: options.local,
      remote: options.remote,
      random: this.random,
      setTimer: this.setTimer,
      ...(options.exclusive ? { exclusive: options.exclusive } : {}),
    });
    this.state = {
      loaded: false,
      tables: emptyTables(),
      event: null,
      syncedAt: null,
      connection: options.remote ? 'connecting' : 'unconfigured',
      problem: null,
      outbox: this.outbox.getState(),
      durable: true,
      userId: null,
      director: false,
      email: null,
      clock: null,
    };
    this.outbox.subscribe(() => {
      this.update({ outbox: this.outbox.getState() });
    });
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async start(): Promise<void> {
    const local = await this.local;
    const saved = await local.loadSnapshot();
    const tables = saved?.schema === this.schema ? fromSnapshot(saved.tables) : emptyTables();
    this.update({
      loaded: true,
      durable: local.durable,
      tables,
      event: currentEvent(tables),
      syncedAt: saved?.schema === this.schema ? saved.savedAt : null,
      userId: saved?.userId ?? null,
      director: saved?.director ?? false,
      email: saved?.email ?? null,
      clock: saved?.clock ?? null,
    });
    await this.outbox.load();
    this.outbox.kick();
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.stopListening?.();
    this.stopListening = null;
    for (const cancel of [
      this.cancelRetry,
      this.cancelSave,
      this.cancelGather,
      this.cancelSecondLook,
    ])
      cancel?.();
  }

  /** Signal is back. */
  wentOnline(): void {
    this.failuresInARow = 0;
    void this.connect();
    this.outbox.kick();
  }

  /** Signal is gone: stop listening now, and start afresh when it is back. */
  wentOffline(): void {
    if (!this.remote) return;
    this.stopListening?.();
    this.stopListening = null;
    this.live = false;
    this.update({ connection: 'offline' });
  }

  /**
   * The app has gone to the background, been swiped away, or is reloading.
   * Whatever has not been saved yet is saved now: the phone may not get the
   * moment it was waiting for, and an angler who saw "Approved" should still
   * see it when they reopen the app with no signal.
   */
  becameHidden(): void {
    this.hiddenAt = this.now();
    if (!this.cancelSave) return;
    this.cancelSave();
    this.cancelSave = null;
    void this.save();
  }

  /**
   * The app is on screen again. A phone, an iPhone especially, may have frozen
   * it in the background; after more than a minute away, read everything
   * again rather than trust that nothing was missed.
   */
  becameVisible(): void {
    const away = this.hiddenAt === null ? 0 : this.now() - this.hiddenAt;
    this.hiddenAt = null;
    if (this.state.connection !== 'live') void this.connect();
    else if (away > STALE_AFTER_HIDDEN_MS) void this.readEverything();
    this.outbox.kick();
  }

  /** Resolves once every read under way has finished. For tests. */
  async settled(): Promise<void> {
    await Promise.all(this.reads.values());
    await this.outbox.settled();
  }

  /**
   * Asks the server now, for what cannot wait in the outbox: registering, or
   * bringing an entry onto this phone, where the answer is the point.
   * Throws a RemoteError, offline included.
   */
  async call(fn: FunctionName, args: Readonly<Record<string, Json>>): Promise<Json> {
    const remote = this.remote;
    if (!remote) throw new RemoteError({ kind: 'offline' });
    this.signedIn(await remote.signIn());
    return remote.call(fn, args);
  }

  /** Keeps something the angler did, and sends it when there is signal. */
  queue(item: NewOutboxItem, files: Readonly<Record<string, StoredFile>> = {}): Promise<void> {
    return this.outbox.add(item, files);
  }

  /** Reads these tables of the current event now, rather than waiting for their signals. */
  async refresh(tables: readonly Exclude<TableName, 'events'>[]): Promise<void> {
    const eventId = this.state.event?.id;
    if (!eventId) return;
    await Promise.all(
      tables.map((table) =>
        this.read(table, async (remote) => {
          const rows = await remote.readTable(table, eventId);
          if (this.state.event?.id === eventId) {
            this.setTables(replaceTable(this.state.tables, table, rows));
          }
        }),
      ),
    );
  }

  /** Reads the list of events now, rather than waiting for its signal. Needs signal. */
  async refreshEvents(): Promise<void> {
    if (!this.remote) throw new RemoteError({ kind: 'offline' });
    await this.readEvents();
  }

  /**
   * One table of any event, or of every event (null), read and handed back
   * without being kept: the director setting up an event that is not the
   * current one, or carrying last year's answers forward. Needs signal.
   */
  async peek<T extends Exclude<TableName, 'events'>>(
    table: T,
    eventId: string | null,
  ): Promise<Row<T>[]> {
    const remote = this.remote;
    if (!remote) throw new RemoteError({ kind: 'offline' });
    this.signedIn(await remote.signIn());
    return remote.readTable(table, eventId);
  }

  /** Reads back a file kept with an outbox item: a catch photo still waiting to send. */
  async readFile(itemId: string, name: string): Promise<StoredFile | undefined> {
    return (await this.local).file(itemId, name);
  }

  private readonly photoUrls = new Map<string, { url: Promise<string>; until: number }>();

  /** A catch photo's address, asked for once and reused until shortly before it lapses. */
  photoUrl(path: string): Promise<string> {
    const remote = this.remote;
    if (!remote) return Promise.reject(new RemoteError({ kind: 'offline' }));
    const kept = this.photoUrls.get(path);
    if (kept && kept.until > this.now()) return kept.url;
    const url = remote.photoUrl(path);
    this.photoUrls.set(path, { url, until: this.now() + PHOTO_URL_REUSE_MS });
    url.catch(() => this.photoUrls.delete(path));
    return url;
  }

  /** Measures the phone's clock against the server's, halfway through the round trip. */
  private async checkClock(remote: Remote): Promise<void> {
    try {
      const sent = this.now();
      const serverAt = await remote.serverTime();
      const back = this.now();
      this.update({
        clock: { offsetMs: Math.round(serverAt - (sent + back) / 2), measuredAt: back },
      });
      this.scheduleSave();
    } catch {
      // No reading this time; the last one stands, or the stamp says unverified.
    }
  }

  private signedIn(account: Account): void {
    const { id, director, email } = account;
    const s = this.state;
    if (id === s.userId && director === s.director && email === s.email) return;
    this.update({ userId: id, director, email });
    this.scheduleSave();
  }

  /**
   * Signs this phone in as the tournament director, in place of its own
   * account, and reads everything again: the director may see far more.
   * Needs signal. Throws a RemoteError, 'not_director' included.
   */
  async signInDirector(email: string, password: string): Promise<void> {
    const remote = this.remote;
    if (!remote) throw new RemoteError({ kind: 'offline' });
    this.signedIn(await remote.signInDirector(email, password));
    this.rejoin();
  }

  /** Back to an ordinary phone, signed in afresh. Needs signal. */
  async signOutDirector(): Promise<void> {
    const remote = this.remote;
    if (!remote) throw new RemoteError({ kind: 'offline' });
    this.signedIn(await remote.signOut());
    this.rejoin();
  }

  /** Listens again under the new account; joining reads everything afresh. */
  private rejoin(): void {
    this.stopListening?.();
    this.stopListening = null;
    this.live = false;
    this.listen();
    void this.readEverything();
  }

  private async connect(): Promise<void> {
    const remote = this.remote;
    if (!remote || this.connecting || this.stopped) return;
    if (!this.online()) {
      this.update({ connection: 'offline' });
      return;
    }
    this.connecting = true;
    this.cancelRetry?.();
    this.cancelRetry = null;
    if (this.state.connection !== 'live') this.update({ connection: 'connecting', problem: null });
    try {
      this.signedIn(await remote.signIn());
      void this.checkClock(remote);
      await this.readEvents();
      if (!this.stopListening) this.listen();
      await this.readEvent();
      this.failuresInARow = 0;
      this.update({ connection: this.live ? 'live' : 'connecting' });
    } catch (error) {
      this.lost(failureOf(error));
    } finally {
      this.connecting = false;
    }
  }

  private lost(failure: ReturnType<typeof failureOf>): void {
    if (failure.kind === 'refused') {
      this.update({ connection: 'refused', problem: failure.detail });
      return;
    }
    this.update({ connection: this.online() ? 'reconnecting' : 'offline' });
    this.retryLater();
  }

  private retryLater(): void {
    if (this.stopped || this.cancelRetry) return;
    const backoff = Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** this.failuresInARow);
    this.failuresInARow += 1;
    this.cancelRetry = this.setTimer(
      () => {
        this.cancelRetry = null;
        void this.connect();
      },
      backoff * (0.8 + 0.4 * this.random()),
    );
  }

  private listen(): void {
    const remote = this.remote;
    if (!remote) return;
    const eventId = this.state.event?.id ?? null;
    this.listeningTo = eventId;
    const topics = eventId ? ['events', `event:${eventId}`] : ['events'];
    this.stopListening = remote.listen(
      topics,
      (signal) => {
        this.heard(signal);
      },
      (status) => {
        this.listenStatus(status);
      },
    );
  }

  private listenStatus(status: LiveStatus): void {
    this.live = status === 'live';
    if (status === 'live') {
      this.update({ connection: 'live', problem: null });
      // Whatever changed before listening started arrives in this read, and
      // whatever changed before Supabase's relay was running, in the next.
      void this.readEverything();
      this.cancelSecondLook?.();
      this.cancelSecondLook = this.setTimer(() => {
        this.cancelSecondLook = null;
        if (this.live) void this.readEverything();
      }, RELAY_STARTS_MS);
      this.outbox.kick();
    } else if (status === 'lost') {
      // Start over: a channel closed for an expired sign-in is never reopened by itself.
      this.stopListening?.();
      this.stopListening = null;
      this.live = false;
      this.lost({ kind: 'offline' });
    }
  }

  private async readEverything(): Promise<void> {
    try {
      await this.readEvents();
      await this.readEvent();
    } catch (error) {
      this.lost(failureOf(error));
    }
  }

  /** The list of events, and with it which one is current. */
  private async readEvents(): Promise<void> {
    await this.read('events', async (remote) => {
      const rows = await remote.readTable('events', null);
      this.setTables(replaceTable(this.state.tables, 'events', rows));
    });
    if (this.stopListening && (this.state.event?.id ?? null) !== this.listeningTo) {
      // The director moved every phone to another event: listen there instead.
      this.stopListening();
      this.stopListening = null;
      this.live = false;
      this.listen();
    }
  }

  /** Every table of the current event, whole. */
  private async readEvent(): Promise<void> {
    const eventId = this.state.event?.id;
    if (!eventId) {
      this.update({ syncedAt: this.now() });
      return;
    }
    await Promise.all(
      EVENT_TABLES.map((table) =>
        this.read(table, async (remote) => {
          const rows = await remote.readTable(table, eventId);
          if (this.state.event?.id === eventId) {
            this.setTables(replaceTable(this.state.tables, table, rows));
          }
        }),
      ),
    );
    this.update({ syncedAt: this.now() });
  }

  private heard(signal: Signal): void {
    const column = signal.table === 'events' ? null : singleColumn(signal.table, signal.key);
    const pending = this.pending.get(signal.table);
    if (column === null || pending === 'all') {
      this.pending.set(signal.table, 'all');
    } else {
      const byColumn = pending ?? new Map<string, Set<string | number>>();
      const value = signal.key[column];
      if (value !== undefined) byColumn.set(column, (byColumn.get(column) ?? new Set()).add(value));
      const count = [...byColumn.values()].reduce((n, values) => n + values.size, 0);
      this.pending.set(signal.table, count > MANY ? 'all' : byColumn);
    }
    this.cancelGather ??= this.setTimer(() => {
      this.cancelGather = null;
      void this.readPending();
    }, GATHER_MS);
  }

  private async readPending(): Promise<void> {
    const batch = [...this.pending];
    this.pending.clear();
    const eventId = this.state.event?.id ?? null;
    try {
      await Promise.all(
        batch.map(async ([table, pending]) => {
          if (table === 'events') {
            await this.readEvents();
            return;
          }
          if (!eventId) return;
          await this.read(table, async (remote) => {
            if (pending === 'all') {
              const rows = await remote.readTable(table, eventId);
              this.setTables(replaceTable(this.state.tables, table, rows));
              return;
            }
            for (const [column, values] of pending) {
              const list = [...values];
              const rows = await remote.readMatching(table, column, list);
              this.setTables(replaceMatching(this.state.tables, table, column, list, rows));
            }
          });
        }),
      );
      if (this.state.connection === 'live') this.update({ syncedAt: this.now() });
    } catch (error) {
      // The next time listening starts, everything is read afresh.
      this.lost(failureOf(error));
    }
  }

  /** Runs a read of one table after any read of it already under way. */
  private read(table: TableName, run: (remote: Remote) => Promise<void>): Promise<void> {
    const remote = this.remote;
    if (!remote) return Promise.resolve();
    const before = this.reads.get(table) ?? Promise.resolve();
    const mine = before.then(
      () => run(remote),
      () => run(remote),
    );
    const settled = mine.then(
      () => undefined,
      () => undefined,
    );
    this.reads.set(table, settled);
    void settled.then(() => {
      if (this.reads.get(table) === settled) this.reads.delete(table);
    });
    return mine;
  }

  private setTables(next: TableMaps): void {
    if (next === this.state.tables) return;
    const event = currentEvent(next);
    // Another event is current: nothing of the last one belongs on screen.
    const moved = this.state.event !== null && event?.id !== this.state.event.id;
    const tables = moved ? withoutEventTables(next) : next;
    this.update({ tables, event });
    this.scheduleSave();
  }

  private scheduleSave(): void {
    this.cancelSave ??= this.setTimer(() => {
      this.cancelSave = null;
      void this.save();
    }, SAVE_AFTER_MS);
  }

  private async save(): Promise<void> {
    const local = await this.local;
    await local.saveSnapshot({
      schema: this.schema,
      eventId: this.state.event?.id ?? null,
      userId: this.state.userId,
      director: this.state.director,
      email: this.state.email,
      clock: this.state.clock,
      tables: toSnapshot(this.state.tables),
      savedAt: this.state.syncedAt ?? this.now(),
    });
  }

  private update(change: Partial<SyncState>): void {
    const next = { ...this.state, ...change };
    const same = (Object.keys(change) as (keyof SyncState)[]).every(
      (key) => next[key] === this.state[key],
    );
    if (same) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
