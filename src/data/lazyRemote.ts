import type { Remote } from './remote';

/**
 * A server whose client code loads on first use. Supabase's client is over a
 * third of the app's code; the first screen draws from the phone's own copy
 * without it. The offline cache holds both parts, so this changes nothing
 * with no signal.
 */
export function lazyRemote(load: () => Promise<Remote>): Remote {
  let loading: Promise<Remote> | null = null;
  const remote = () => {
    loading ??= load().catch((error: unknown) => {
      loading = null; // Try the download again next time.
      throw error;
    });
    return loading;
  };
  return {
    signIn: async () => (await remote()).signIn(),
    signInDirector: async (email, password) => (await remote()).signInDirector(email, password),
    signOut: async () => (await remote()).signOut(),
    accessToken: async () => (await remote()).accessToken(),
    readTable: async (table, eventId) => (await remote()).readTable(table, eventId),
    readMatching: async (table, column, values) =>
      (await remote()).readMatching(table, column, values),
    call: async (fn, args) => (await remote()).call(fn, args),
    upload: async (path, file) => (await remote()).upload(path, file),
    removePhoto: async (path) => (await remote()).removePhoto(path),
    photoUrl: async (path) => (await remote()).photoUrl(path),
    serverTime: async () => (await remote()).serverTime(),
    listen(topics, onSignal, onStatus) {
      let stopped = false;
      let stop: (() => void) | null = null;
      remote().then(
        (loaded) => {
          if (!stopped) stop = loaded.listen(topics, onSignal, onStatus);
        },
        () => {
          if (!stopped) onStatus('lost');
        },
      );
      return () => {
        stopped = true;
        stop?.();
      };
    },
  };
}
