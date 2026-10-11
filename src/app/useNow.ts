import { useSyncExternalStore } from 'react';

const MINUTE = 60_000;

function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, MINUTE);
  return () => {
    clearInterval(id);
  };
}

/** The time to the minute, so what depends on it (registration closing) changes on screen by itself. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / MINUTE) * MINUTE);
}
