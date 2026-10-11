// What the phone keeps for itself, in IndexedDB: the last copy of the event,
// so the app opens with no signal, and the outbox, so nothing filed with no
// signal is lost. IndexedDB holds real files, where the old app squeezed
// photos into 5 MB of localStorage text.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Json, StoredFile } from './remote';
import type { FunctionName, Row, TableName } from './tables';

/** The last copy of the server's rows this phone was allowed to read. */
export interface Snapshot {
  /** The database version the app was built against; a copy from another is thrown away. */
  readonly schema: string;
  readonly eventId: string | null;
  readonly tables: { readonly [T in TableName]?: readonly Row<T>[] };
  readonly savedAt: number;
}

/** One request to the server, waiting its turn. */
export type Step =
  | {
      readonly kind: 'call';
      readonly fn: FunctionName;
      readonly args: Readonly<Record<string, Json>>;
      /** Refusals that mean an earlier try got through, such as 'catch_not_found' after a withdrawal. */
      readonly alreadyDone?: readonly string[];
    }
  | {
      readonly kind: 'upload';
      readonly path: string;
      /** The file's name among the item's files. */
      readonly file: string;
    };

/** Something the angler did, kept until the server has every step of it. */
export interface OutboxItem {
  /** Queue order. */
  readonly seq: number;
  readonly id: string;
  /** What it was, in the angler's words: "Walleye, 21.5 in". */
  readonly label: string;
  readonly createdAt: number;
  /** The steps still to do, in order. A step leaves the list once the server has it. */
  readonly steps: readonly Step[];
  readonly attempts: number;
  /** Set when the server refused a step for good. The item stays, for the angler to see. */
  readonly failure: { readonly key: string; readonly detail: string } | null;
}

export type NewOutboxItem = Omit<OutboxItem, 'seq' | 'attempts' | 'failure'>;

export interface LocalStore {
  /** False when the browser would not give us IndexedDB, and everything is kept in memory only. */
  readonly durable: boolean;
  loadSnapshot(): Promise<Snapshot | undefined>;
  saveSnapshot(snapshot: Snapshot): Promise<void>;
  /** The outbox, oldest first. */
  outbox(): Promise<OutboxItem[]>;
  /** Adds an item and its files together: all of it is kept, or none. */
  addItem(item: NewOutboxItem, files: Readonly<Record<string, StoredFile>>): Promise<OutboxItem>;
  putItem(item: OutboxItem): Promise<void>;
  /** Removes an item and its files. */
  removeItem(item: OutboxItem): Promise<void>;
  file(itemId: string, name: string): Promise<StoredFile | undefined>;
}

interface Schema extends DBSchema {
  snapshots: { key: string; value: Snapshot };
  outbox: { key: number; value: OutboxItem };
  files: { key: string; value: StoredFile };
}

const SNAPSHOT = 'current';

function fileKey(itemId: string, name: string): string {
  return `${itemId}/${name}`;
}

/** Every file key belonging to one item. */
function filesOf(itemId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${itemId}/`, `${itemId}/￿`);
}

class IdbStore implements LocalStore {
  readonly durable = true;
  private readonly db: IDBPDatabase<Schema>;

  constructor(db: IDBPDatabase<Schema>) {
    this.db = db;
  }

  loadSnapshot() {
    return this.db.get('snapshots', SNAPSHOT);
  }

  async saveSnapshot(snapshot: Snapshot) {
    await this.db.put('snapshots', snapshot, SNAPSHOT);
  }

  outbox() {
    return this.db.getAll('outbox');
  }

  async addItem(item: NewOutboxItem, files: Readonly<Record<string, StoredFile>>) {
    const tx = this.db.transaction(['outbox', 'files'], 'readwrite');
    const fresh = { ...item, attempts: 0, failure: null };
    // The store numbers the item and writes the number into it as `seq`.
    const seq = await tx.objectStore('outbox').add(fresh as OutboxItem);
    for (const [name, file] of Object.entries(files)) {
      await tx.objectStore('files').put(file, fileKey(item.id, name));
    }
    await tx.done;
    return { ...fresh, seq };
  }

  async putItem(item: OutboxItem) {
    await this.db.put('outbox', item);
  }

  async removeItem(item: OutboxItem) {
    const tx = this.db.transaction(['outbox', 'files'], 'readwrite');
    await tx.objectStore('outbox').delete(item.seq);
    await tx.objectStore('files').delete(filesOf(item.id));
    await tx.done;
  }

  file(itemId: string, name: string) {
    return this.db.get('files', fileKey(itemId, name));
  }
}

/** For a browser that refuses IndexedDB (some private windows): works, but forgets on reload. */
export class MemoryStore implements LocalStore {
  readonly durable = false;
  private snapshot: Snapshot | undefined;
  private readonly items = new Map<number, OutboxItem>();
  private readonly files = new Map<string, StoredFile>();
  private nextSeq = 1;

  loadSnapshot() {
    return Promise.resolve(this.snapshot);
  }

  saveSnapshot(snapshot: Snapshot) {
    this.snapshot = snapshot;
    return Promise.resolve();
  }

  outbox() {
    return Promise.resolve([...this.items.values()].sort((a, b) => a.seq - b.seq));
  }

  addItem(item: NewOutboxItem, files: Readonly<Record<string, StoredFile>>) {
    const stored: OutboxItem = { ...item, seq: this.nextSeq++, attempts: 0, failure: null };
    this.items.set(stored.seq, stored);
    for (const [name, file] of Object.entries(files)) this.files.set(fileKey(item.id, name), file);
    return Promise.resolve(stored);
  }

  putItem(item: OutboxItem) {
    this.items.set(item.seq, item);
    return Promise.resolve();
  }

  removeItem(item: OutboxItem) {
    this.items.delete(item.seq);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(`${item.id}/`)) this.files.delete(key);
    }
    return Promise.resolve();
  }

  file(itemId: string, name: string) {
    return Promise.resolve(this.files.get(fileKey(itemId, name)));
  }
}

export async function openLocal(name = 'livewire'): Promise<LocalStore> {
  try {
    const db = await openDB<Schema>(name, 1, {
      upgrade(db) {
        db.createObjectStore('snapshots');
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        db.createObjectStore('files');
      },
      // A newer version of the app, open in another tab, needs the database
      // upgraded: step aside rather than hold it up.
      blocking() {
        db.close();
      },
    });
    return new IdbStore(db);
  } catch (error) {
    console.error('IndexedDB is unavailable; keeping everything in memory', error);
    return new MemoryStore();
  }
}
