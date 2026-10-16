// Starts the sync engine for the browser: the server this build was made for,
// the phone's own storage, and the browser's word on signal and visibility.
import { serverConfig } from './config';
import { lazyRemote } from './lazyRemote';
import { openLocal } from './local';
import { Sync } from './sync';

export function startSync(): Sync {
  const config = serverConfig(import.meta.env);
  const sync = new Sync({
    remote: config
      ? lazyRemote(async () => (await import('./supabase')).supabaseRemote(config))
      : null,
    local: openLocal(),
    schema: import.meta.env.VITE_SCHEMA_VERSION,
  });
  window.addEventListener('online', () => {
    sync.wentOnline();
  });
  window.addEventListener('offline', () => {
    sync.wentOffline();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync.becameVisible();
    else sync.becameHidden();
  });
  // Leaving or reloading the page. Safari does not always say "hidden" first.
  window.addEventListener('pagehide', () => {
    sync.becameHidden();
  });
  // Ask the browser not to clear the outbox to make room. Installed apps are
  // usually granted this; if not, it is kept anyway until space runs short.
  void navigator.storage.persist().catch(() => false);
  void sync.start();
  return sync;
}
