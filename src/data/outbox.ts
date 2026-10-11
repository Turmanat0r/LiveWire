// The outbox: everything an angler does goes here first, is kept on the
// phone, and is sent in order whenever there is signal.
//
// Sending is strictly in order. If the server cannot be reached, everything
// waits and is tried again later, so a correction never overtakes the catch
// it corrects. If the server refuses an item for good, that item is set aside
// with the reason, for the angler to see, and the rest carry on.
//
// Every step is safe to send twice: catches, messages and bets carry ids made
// on the phone, and a photo already stored counts as stored. A step whose
// first try got through but whose answer was lost is simply sent again.
import type { LocalStore, NewOutboxItem, OutboxItem, Step } from './local';
import { failureOf, RemoteError, type Failure, type Remote, type StoredFile } from './remote';

export interface OutboxState {
  /** Oldest first. */
  readonly items: readonly OutboxItem[];
  readonly sending: boolean;
  /** Why sending is waiting, if it is. */
  readonly paused: Failure | null;
}

export interface OutboxOptions {
  readonly local: Promise<LocalStore>;
  readonly remote: Remote | null;
  readonly random?: () => number;
  readonly setTimer?: (run: () => void, ms: number) => () => void;
  /** Runs `send` holding a lock other tabs respect, so two tabs never send the same item. */
  readonly exclusive?: (send: () => Promise<void>) => Promise<void>;
}

const FIRST_RETRY_MS = 2_000;
const LAST_RETRY_MS = 60_000;

function browserLock(send: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request('livewire-outbox', send);
  }
  return send();
}

function browserTimer(run: () => void, ms: number): () => void {
  const id = setTimeout(run, ms);
  return () => {
    clearTimeout(id);
  };
}

export class Outbox {
  private readonly local: Promise<LocalStore>;
  private readonly remote: Remote | null;
  private readonly random: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  private readonly exclusive: (send: () => Promise<void>) => Promise<void>;
  private readonly listeners = new Set<() => void>();
  private state: OutboxState = { items: [], sending: false, paused: null };
  private running: Promise<void> | null = null;
  private again = false;
  private failuresInARow = 0;
  private cancelRetry: (() => void) | null = null;

  constructor(options: OutboxOptions) {
    this.local = options.local;
    this.remote = options.remote;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? browserTimer;
    this.exclusive = options.exclusive ?? browserLock;
  }

  getState = (): OutboxState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Reads back what was waiting when the app last closed. */
  async load(): Promise<void> {
    await this.reload();
  }

  /** Keeps an item, then sends it as soon as it can. */
  async add(item: NewOutboxItem, files: Readonly<Record<string, StoredFile>> = {}): Promise<void> {
    await (await this.local).addItem(item, files);
    await this.reload();
    this.kick();
  }

  /** Forgets an item the server refused, once the angler has seen why. */
  async discard(item: OutboxItem): Promise<void> {
    await (await this.local).removeItem(item);
    await this.reload();
  }

  /** Sends whatever is waiting, now: signal is back, or the app was reopened. */
  kick(): void {
    void this.drain();
  }

  /** Resolves once the outbox has sent all it can for now. For tests and for shutting down. */
  async settled(): Promise<void> {
    while (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.running = (async () => {
      try {
        this.again = false;
        do {
          await this.exclusive(() => this.sendAll());
        } while (this.askedAgain());
      } catch (error) {
        console.error('The outbox stopped unexpectedly', error);
        this.waitAndRetry({ kind: 'offline' });
      } finally {
        this.update({ sending: false });
      }
    })();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  private async sendAll(): Promise<void> {
    const remote = this.remote;
    if (!remote) return;
    const local = await this.local;
    let signedIn = false;
    for (;;) {
      const items = await local.outbox();
      this.update({ items });
      const next = items.find((item) => item.failure === null);
      if (!next) {
        this.failuresInARow = 0;
        this.update({ paused: null });
        return;
      }
      this.update({ sending: true });
      const [step, ...rest] = next.steps;
      if (step) {
        try {
          if (!signedIn) await remote.signIn();
          signedIn = true;
          await this.send(remote, local, next, step);
        } catch (error) {
          const failure = failureOf(error);
          if (failure.kind !== 'refused') {
            await local.putItem({ ...next, attempts: next.attempts + 1 });
            await this.reload();
            this.waitAndRetry(failure);
            return;
          }
          if (!(step.kind === 'call' && step.alreadyDone?.includes(failure.key))) {
            const reason = { key: failure.key, detail: failure.detail };
            await local.putItem({ ...next, attempts: next.attempts + 1, failure: reason });
            continue;
          }
        }
      }
      if (rest.length === 0) await local.removeItem(next);
      else await local.putItem({ ...next, steps: rest });
      this.failuresInARow = 0;
      this.update({ paused: null });
    }
  }

  private async send(remote: Remote, local: LocalStore, item: OutboxItem, step: Step) {
    if (step.kind === 'call') {
      await remote.call(step.fn, step.args);
      return;
    }
    const file = await local.file(item.id, step.file);
    if (!file) {
      throw new RemoteError({
        kind: 'refused',
        key: 'file_missing',
        detail: 'The photo was not kept on this phone, so it cannot be sent.',
      });
    }
    await remote.upload(step.path, file);
  }

  /** Whether something was added or kicked while sending; clears the request. */
  private askedAgain(): boolean {
    const asked = this.again;
    this.again = false;
    return asked;
  }

  /** Waits longer after each failure in a row, up to a minute, with a little jitter. */
  private waitAndRetry(failure: Failure): void {
    this.update({ paused: failure });
    const backoff = Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** this.failuresInARow);
    this.failuresInARow += 1;
    const delay = backoff * (0.8 + 0.4 * this.random());
    this.cancelRetry?.();
    this.cancelRetry = this.setTimer(() => {
      this.cancelRetry = null;
      this.kick();
    }, delay);
  }

  private async reload(): Promise<void> {
    this.update({ items: await (await this.local).outbox() });
  }

  private update(change: Partial<OutboxState>): void {
    const next = { ...this.state, ...change };
    if (
      next.items === this.state.items &&
      next.sending === this.state.sending &&
      next.paused === this.state.paused
    ) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
