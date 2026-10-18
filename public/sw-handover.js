// Loaded into the app's offline worker (vite.config.ts, workbox importScripts)
// for the switch-over, when this app replaces the old one at the same address.
//
// A phone that installed the old app keeps the old offline worker until a new
// one takes over. The old app's "Update" banner asks a waiting worker to take
// over by posting 'skip-waiting'; this app's worker listens for
// { type: 'SKIP_WAITING' }. Answering the old message as well means the old
// app's own button brings the new one in, instead of the phone waiting until
// every copy of the old app has been closed.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

// The old app kept its files in caches called 'livewire-v<n>-shell' and
// 'livewire-v<n>-runtime'. Nothing reads them any more: give the space back.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => /^livewire-v\d+-(shell|runtime)$/.test(n))
            .map((n) => caches.delete(n)),
        ),
      ),
  );
});
