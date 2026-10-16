// The server, as the rest of the app sees it: a narrow interface the sync
// engine and the outbox are written against, so they can be tested against a
// fake server, and so the details of the Supabase client stay in one file
// (supabaseRemote.ts).
import type { FunctionName, Row, TableName } from './tables';

/** Why a request did not succeed, sorted by what to do about it. */
export type Failure =
  /** It never reached the server: no signal. Try again when there is. */
  | { readonly kind: 'offline' }
  /** The server is struggling or busy. Try again shortly. */
  | { readonly kind: 'unavailable'; readonly status: number }
  /** This phone's sign-in has lapsed. Sign in again, then retry. */
  | { readonly kind: 'signed-out' }
  /** The server said no, and will say no again: `key` names the rule, `detail` says it in words. */
  | { readonly kind: 'refused'; readonly key: string; readonly detail: string };

export class RemoteError extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(failure.kind === 'refused' ? `${failure.key}: ${failure.detail}` : failure.kind);
    this.name = 'RemoteError';
    this.failure = failure;
  }
}

/** The failure behind an error, treating anything unrecognised as no signal. */
export function failureOf(error: unknown): Failure {
  return error instanceof RemoteError ? error.failure : { kind: 'offline' };
}

/** Worth trying again later, as opposed to refused for good. */
export function isTransient(failure: Failure): boolean {
  return failure.kind !== 'refused';
}

/** "This row changed": a table and the columns that pick the row out. */
export interface Signal {
  readonly table: TableName;
  readonly key: Readonly<Record<string, string | number>>;
}

export type LiveStatus = 'joining' | 'live' | 'lost';

/** A file kept on the phone until the server has it. */
export interface StoredFile {
  readonly bytes: ArrayBuffer;
  readonly type: string;
}

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Who this phone is signed in as. */
export interface Account {
  readonly id: string;
  /** The tournament director's account: the database lets it see and change everything. */
  readonly director: boolean;
  /** For the director's account; an anonymous one has none. */
  readonly email: string | null;
}

export interface Remote {
  /** Signs this phone in, anonymously, unless it already is. */
  signIn(): Promise<Account>;
  /**
   * Signs in to the director's account, replacing this phone's own. An account
   * that is not the director's is signed straight out again, and refused.
   */
  signInDirector(email: string, password: string): Promise<Account>;
  /** Leaves the director's account: the phone signs in afresh, anonymously. */
  signOut(): Promise<Account>;
  /** Every row of a table this phone may read: one event's, or for `events`, every event. */
  readTable<T extends TableName>(table: T, eventId: string | null): Promise<Row<T>[]>;
  /** The rows of a table whose `column` holds one of `values`. */
  readMatching<T extends TableName>(
    table: T,
    column: string,
    values: readonly (string | number)[],
  ): Promise<Row<T>[]>;
  /** Calls a database function with named arguments. */
  call(fn: FunctionName, args: Readonly<Record<string, Json>>): Promise<Json>;
  /** Stores a catch photo. A photo already there counts as stored: photos never change. */
  upload(path: string, file: StoredFile): Promise<void>;
  /** Removes a catch photo. One already gone counts as removed. */
  removePhoto(path: string): Promise<void>;
  /** A short-lived address a phone may load a catch photo from. */
  photoUrl(path: string): Promise<string>;
  /** The server's clock, in milliseconds since 1970. */
  serverTime(): Promise<number>;
  /** Listens for signals on these topics until the returned function is called. */
  listen(
    topics: readonly string[],
    onSignal: (signal: Signal) => void,
    onStatus: (status: LiveStatus) => void,
  ): () => void;
}
