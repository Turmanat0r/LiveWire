import type { Step } from '../../data/local';
import { useSyncEngine } from '../../data/useSync';

/** Every director change goes through the outbox: shown at once, sent when there is signal. */
export function useDirectorQueue() {
  const sync = useSyncEngine();
  return (label: string, steps: Step[]) => {
    void sync.queue({ id: crypto.randomUUID(), label, createdAt: Date.now(), steps });
  };
}
