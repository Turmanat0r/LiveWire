// The last fix this phone took, for whichever screen wants it: the safety
// screen's reading, the distance to a beacon, the text to the director. Kept
// in memory only: a position from before the app was closed is history.
import { useSyncExternalStore } from 'react';
import type { Fix, TimedFix } from './location';

let latest: TimedFix | null = null;
const listeners = new Set<() => void>();

export function rememberFix(fix: Fix, at: number = Date.now()): TimedFix {
  latest = { ...fix, at };
  listeners.forEach((l) => {
    l();
  });
  return latest;
}

export function latestFix(): TimedFix | null {
  return latest;
}

/** For tests: start each with no fix. */
export function forgetFix(): void {
  latest = null;
  listeners.forEach((l) => {
    l();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLatestFix(): TimedFix | null {
  return useSyncExternalStore(subscribe, latestFix);
}
