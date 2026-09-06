// LiveWire service worker.
//
// WHY
// Everything about the data layer already survives losing signal - writes go to
// an outbox and retry, reads fall back to a local mirror. None of that helps if
// the PAGE itself cannot be fetched, which is the state the installed app was
// in: added to the home screen, opened out of range, blank.
//
// Canyon Ferry has stretches with no bars in them. An angler needs to be able
// to open the app and queue a catch from any of them.
//
// BUMP THE VERSION when index.html changes in a way that must reach phones
// immediately. Everything else is handled by the network-first rule below.
// v2: the runtime cache is now capped (see trimRuntime). Bumping the version
// also drops the uncapped v1 cache on activate, which is the only way to clear
// the tiles already sitting on phones from before that limit existed.
const VERSION = 'livewire-v2';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

// The whole app is one file, so this list is short by design.
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './livewire-icon-192.png',
  './livewire-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // Not addAll: one 404 there would reject the whole install and leave the
      // app with no cache at all, which is worse than missing one icon.
      .then((cache) => Promise.all(
        SHELL_FILES.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Anything that must never be served from a cache. A stale leaderboard is a
// wrong leaderboard, and a cached POST is meaningless.
function isLiveData(url) {
  return url.pathname.startsWith('/api/') ||
         url.hostname.endsWith('.supabase.co') ||
         url.hostname.endsWith('.googleapis.com');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (isLiveData(url)) return;             // straight to the network, always

  const isPage = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    // Network first, so a deploy reaches a phone with signal on the next open
    // rather than whenever the cache happens to turn over. The cached copy is
    // the fallback, which is the whole point of being here.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Everything else - icons, the Leaflet bundle, map tiles - is versioned or
  // immutable, so cache first and only pay for it once.
  //
  // Map tiles are the reason this needs a ceiling. Every pan and zoom on the
  // boundary editor is more tiles, they are never revisited, and nothing ever
  // removed them - so the cache grew with every event until the browser
  // started evicting site data on its own terms, which can take the offline
  // shell with it. Capped, oldest out first.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Opaque cross-origin responses are cached too: a map tile that renders
        // is worth more than knowing whether it was a 200.
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME)
            .then((c) => c.put(req, copy).then(() => trimRuntime(c)))
            .catch(() => {});
        }
        return res;
      }).catch(() => hit);
    })
  );
});

// How many runtime entries to keep. A few hundred tiles is a generous working
// set for one reservoir; past that the oldest go. keys() comes back in
// insertion order, so the front of the list is the oldest.
const RUNTIME_MAX = 300;
let trimming = false;
function trimRuntime(cache) {
  if (trimming) return Promise.resolve();      // one pass at a time
  trimming = true;
  return cache.keys()
    .then((keys) => {
      if (keys.length <= RUNTIME_MAX) return null;
      return Promise.all(keys.slice(0, keys.length - RUNTIME_MAX).map((k) => cache.delete(k)));
    })
    .catch(() => null)
    .then(() => { trimming = false; });
}

// Lets the page tell a waiting worker to take over immediately, so "Update"
// means update rather than "close every tab and hope".
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
