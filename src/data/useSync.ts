import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Sync, SyncState } from './sync';

/** The app's one sync engine, provided in main.tsx. */
export const SyncContext = createContext<Sync | null>(null);

/**
 * A slice of the sync state, re-rendering only when that slice changes.
 * `select` must return something already in the state (a table, the event,
 * the outbox), not a new object built on each call.
 */
export function useSync<T>(select: (state: SyncState) => T): T {
  const sync = useContext(SyncContext);
  if (!sync) throw new Error('useSync needs SyncContext above it; see main.tsx');
  return useSyncExternalStore(sync.subscribe, () => select(sync.getState()));
}
