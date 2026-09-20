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
// v3: the Supabase SDK joined the shell - see SHELL_FILES.
// v4: the page stopped being one file. Its stylesheet and its whole script
//     are separate files now (the Content-Security-Policy no longer allows
//     them inline), and the fonts and Leaflet are served from this repo
//     instead of a CDN. All of it is shell, and /app/ is network-first -
//     see isAppCode below for why that one is not optional.
const VERSION = 'livewire-v4';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

// Everything needed to open the app and file a fish with no signal at all.
//
// This list used to be described as "nearly one file". It is not any more, and
// the reason is worth keeping: index.html carried the entire stylesheet and the
// entire application inline, and a Content-Security-Policy cannot tell an
// inline block from one an attacker injected into a chat message or a handle.
// Dropping 'unsafe-inline' meant moving both out to /app/, which is why they
// are named here.
//
// THE SDK is the one dependency an angler cannot fish without. It holds this
// device's anonymous session, and with no session every write policy in the
// database refuses the phone - it can read the tournament and save nothing. It
// used to sit in the RUNTIME cache with the map tiles, which was quietly wrong
// twice over: that cache is capped and evicts oldest-first, and keys() returns
// insertion order, so the SDK loaded on the first page view was near the FRONT
// of the queue to be thrown out by an afternoon of panning the boundary editor.
// Evicted plus out of range equals a phone that cannot file a fish.
//
// THE FONTS AND LEAFLET are here for that same reason, found the same way.
// Both used to come off a third party, so offline they simply never arrived:
// the installed app opened out of range in system fallback fonts and had done
// since the day it shipped. Nobody reported it, because it still worked.
//
// Only the latin subset of each font is listed. A browser fetches a subset only
// when a character in its unicode-range is actually drawn, so latin-ext stays
// on the server for the rare name that needs it rather than costing every
// phone bytes it will never render.
//
// SIZE: about 1.6 MB installed, roughly 0.5 MB more than v3. That is a one-off
// on the ramp's signal, and it buys an app that is legible and can draw a
// boundary out of range. Each file is added on its own below, so one failure
// costs that file rather than the whole install.
//
// Rename these whenever a version in a path changes; the paths carry the
// versions so the two cannot silently disagree.
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './app/livewire.css',
  './app/livewire.js',
  './vendor/supabase-js-2.115.0.min.js',
  './livewire-icon-192.png',
  './livewire-icon-512.png',
  './vendor/leaflet-1.9.4/leaflet.css',
  './vendor/leaflet-1.9.4/leaflet.js',
  './vendor/leaflet-1.9.4/images/marker-icon.png',
  './vendor/leaflet-1.9.4/images/marker-icon-2x.png',
  './vendor/leaflet-1.9.4/images/marker-shadow.png',
  './vendor/leaflet-1.9.4/images/layers.png',
  './vendor/leaflet-1.9.4/images/layers-2x.png',
  './vendor/fonts-v1/fonts.css',
  './vendor/fonts-v1/fraunces-500-latin.woff2',
  './vendor/fonts-v1/fraunces-600-latin.woff2',
  './vendor/fonts-v1/inter-400-latin.woff2',
  './vendor/fonts-v1/inter-500-latin.woff2',
  './vendor/fonts-v1/inter-600-latin.woff2',
  './vendor/fonts-v1/oswald-500-latin.woff2',
  './vendor/fonts-v1/oswald-600-latin.woff2',
  './vendor/fonts-v1/oswald-700-latin.woff2',
  './vendor/fonts-v1/space-mono-400-latin.woff2',
  './vendor/fonts-v1/space-mono-700-latin.woff2'
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

// The application itself: the stylesheet and the script that used to be inline
// in index.html. These CANNOT be cache-first, which is where they would land by
// default, and getting it wrong is silent and total: unlike everything under
// /vendor/, they carry no version in their names - they cannot, they change on
// every deploy - so a phone would serve whichever build it installed first, for
// ever, and a fix pushed on the morning of an event would reach nobody. Inline,
// they inherited the page's network-first rule. This is that rule, kept.
function isAppCode(url) {
  return url.pathname.startsWith('/app/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (isLiveData(url)) return;             // straight to the network, always

  const isPage = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isPage || isAppCode(url)) {
    // Network first, so a deploy reaches a phone with signal on the next open
    // rather than whenever the cache happens to turn over. The cached copy is
    // the fallback, which is the whole point of being here.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          // The page is kept under one fixed key so that opening a deep link
          // refreshes the shell rather than filling it with a second copy under
          // a different URL. App files are kept under their own.
          const key = isPage ? './index.html' : req;
          caches.open(SHELL).then((c) => c.put(key, copy)).catch(() => {});
          return res;
        })
        .catch(() => {
          if (isPage) return caches.match('./index.html').then((hit) => hit || caches.match('./'));
          return caches.match(req);
        })
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
