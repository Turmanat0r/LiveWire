import type { ReactNode } from 'react';
import { MemoryStore } from '../data/local';
import type { Remote } from '../data/remote';
import { Sync } from '../data/sync';
import { SyncContext } from '../data/useSync';

/** A sync engine for component tests: no server unless one is given, nothing kept, no timers. */
export function testSync(remote: Remote | null = null): Sync {
  return new Sync({
    remote,
    local: Promise.resolve(new MemoryStore()),
    schema: 'test',
    online: () => true,
    setTimer: () => () => undefined,
    exclusive: (send) => send(),
  });
}

export function WithSync({ sync, children }: { sync: Sync; children: ReactNode }) {
  return <SyncContext value={sync}>{children}</SyncContext>;
}
