# LiveWire

Catch, photo and release scoring for the Montana Kayak Walleye Open. Anglers
register, file a fish with a photo from the water, and watch the leaderboard;
the director runs check-in, approvals, payouts, side bets and the FWP report.

It is a web app that installs to a phone's home screen. There is nothing to
download from an app store and no executable to run.

## Getting it onto a phone

Open the site in the phone's browser and add it to the home screen.

- **iPhone / iPad — Safari.** Share button → *Add to Home Screen* → *Add*.
  It must be Safari; Chrome on iOS cannot install a web app.
- **Android — Chrome.** A banner usually offers *Install*. If it does not,
  menu (⋮) → *Install app* or *Add to Home screen*.

Installed, it opens full screen with no browser chrome, keeps working out of
signal, and holds anything filed offline until there is a bar again.

It also works as an ordinary browser tab. Installing only buys the full screen
and a reliable offline copy.

**Nothing here needs administrator rights, and no app store reviews it.** The
flip side is that the phone has to trust the site, so it has to be served over
HTTPS from a domain you control. Vercel does that by default.

## What the network is for

```
Network:      sync + one API call
Origins:      <project>.supabase.co       tournament data and catch photos
              tile.openstreetmap.org      map tiles, boundary screens only
Purpose:      one shared tournament across every angler's phone
Offline gap:  map tiles. Every screen that draws a map falls back to a text
              readout computed on the phone; nothing about registering,
              filing a catch or reading the leaderboard needs the network.
Conflicts:    last-writer-wins, per record
Credentials:  none on the device. The anon key ships in the page on purpose -
              it is public by design and the database's row policies decide
              what it may do. The Gemini key lives only in a Vercel
              environment variable, read by api/fish-i.js on the server.
```

Nothing else is contacted. There is no analytics, no telemetry, no crash
reporting, no update check and no remote font, script or icon: the page is
drawn entirely from files in this repository.

### The conflict policy, in plain words

**Last-writer-wins, one record at a time.** Two devices that write *the same
record* while out of touch will keep whichever arrived last, and the other is
gone. The app's defence against that is structural rather than clever: one
record per thing, never one record holding a list. A catch is a record. An
angler is a record. *Joining* a side bet is its own record rather than a name
appended to the bet, precisely so two anglers joining at the same moment write
two records instead of fighting over one.

A write that cannot reach the server is parked in an outbox in local storage
and retried with backoff. Losing signal never loses a catch.

Where this still bites: two directors editing the same angler's handle at the
same time. The later save wins and the earlier one vanishes with no warning.

## Offline

Being out of signal is a normal state, not an error. There is no dialog and no
red banner — a quiet line at the top says entries are held on the device and
will sync when there is signal, and that is all.

Everything an angler does works offline: open the app, read the tournament,
register, file a catch with a photo, read the leaderboard as of the last sync.
Only map tiles are genuinely gone, and the boundary screens fall back to text.

A service worker (`sw.js`) holds the whole app — page, stylesheet, script,
fonts, Leaflet and the Supabase SDK — so it opens out of range. That list is
`SHELL_FILES`, and `test/lint.mjs` fails if the page loads something the shell
leaves out.

## Running it locally

```
npm install                 # once - TypeScript, and nothing else
npm run build               # src/*.ts  ->  app/*.js
npm test                    # builds, then runs all three test files
```

Or the tests one at a time, after a build:

```
node test/lint.mjs          # structure, policy, assets, offline shell
node test/events.test.mjs   # behaviour  (1,394 checks)
node test/fish-i.test.mjs   # the serverless endpoint  (125 checks)
```

From the project root. Each exits `0` clean and `1` on any finding. The only
dependency in the project is the TypeScript compiler.

**The app will not run until you have built it.** `app/livewire.js` is
generated and not committed, so a fresh clone has an `index.html` pointing at a
file that is not there yet. `npm run build` is the whole of it, and
`test/lint.mjs` says so by name if you forget.

To open the app itself you need a static server that sends the headers in
`vercel.json`, because the Content-Security-Policy is a header and half of what
it does is invisible without it. Opening `index.html` from the filesystem will
not work: service workers need an origin.

`api/fish-i.js` runs on Vercel, not in the page. It needs `GEMINI_API_KEY` set
in the project's environment variables; without it the director simply sees
Fish-I listed as unavailable and every local photo check keeps working.

## How it is put together

| | |
|---|---|
| `src/livewire.ts` | the entire application — **written here** |
| `src/boot-guard.ts` | the failure screen for when the application does not arrive |
| `types/globals.d.ts` | shared types, no runtime code |
| `app/livewire.js` | the application **as it ships — generated, not committed** |
| `app/livewire.css` | the entire stylesheet — hand-written, committed |
| `index.html` | the markup, and the policy repeated as a `<meta>` tag |
| `vendor/` | the Supabase SDK, Leaflet and the fonts, all served from here |
| `sw.js` | the offline shell |
| `vercel.json` | build command, security headers and cache rules |
| `sql/` | the database schema and its row policies, applied in order |
| `test/` | three Node scripts, no framework |

`app/` holds both generated and written files, which is the one muddy corner:
the `.js` in it is build output and gitignored, the `.css` beside it is
hand-written and committed. `test/lint.mjs` checks both directions against
`git ls-files`, because the filesystem cannot tell them apart.

The script and the stylesheet used to be inline in `index.html`. They are
separate files because the Content-Security-Policy no longer allows
`script-src 'unsafe-inline'`, and with that allowed the policy could not tell
the application apart from a block injected through a chat message or an
angler's handle.

**Every asset is served from this repository.** The fonts and Leaflet used to
come off a CDN, which put a third party on the path of an angler filing a fish;
a content blocker, a filtering DNS or a captive portal at the ramp was enough
to lose them, and that has happened here before. Out of signal they never
arrived at all, so the installed app quietly opened in fallback fonts.

## TypeScript

The app is TypeScript compiled to one classic script. It is **not** modules,
and that is load-bearing rather than a preference: 518 top-level declarations
share a single global scope, `index.html` loads `boot-guard` before the app and
relies on both being ordinary scripts that run in order, and
`test/events.test.mjs` appends a block naming those globals and runs the whole
file through `new Function()`, which cannot execute module syntax at all. One
top-level `export` breaks all of that at once, so `test/lint.mjs` fails if one
appears.

**The compiler settings are deliberately permissive and this is not finished.**
The first pass changed the toolchain without changing the app: same code, same
behaviour, and a browser pass confirming it renders and runs exactly as before.
Switching every check on at the same time would have buried that in about 1,500
findings nobody could review. What is left, in the order it is worth doing:

Measured against the source as it stands, turning them on one at a time. They
do not simply add up - each one changes what the next can infer - so these are
cumulative totals rather than separate piles:

| Turn on | Findings, running total | Mostly |
|---|---|---|
| `strictNullChecks` | 524 | `getElementById` returning null |
| `+ noImplicitAny` | 1,441 | untyped function parameters |
| `+ noUncheckedIndexedAccess` | 1,485 | array and record access |
| `+ the rest of strict, and the unused checks` | 1,501 | `catch` variables typed `unknown` |

Worth knowing before you start: `noUncheckedIndexedAccess` on its own reports
nothing at all, because it has no effect without `strictNullChecks`. And a CLI
`--strict` will *not* override an explicit `"noImplicitAny": false` in
`tsconfig.json` - the specific setting wins over the umbrella one, whichever
side it is written on. That is worth remembering when a run comes back
suspiciously clean.

The last row already found three real ones: `nameEl`, `recEl` and `catches`
are declared and never read.

Along the way the `any`s in `types/globals.d.ts` — `L`, `supabase`, `claude` —
should get real shapes. They are honest `any` for now rather than an invented
type that reads as verified when nobody checked it.

One thing already earned its keep: the first draft of `GeoFix` called the
accuracy field `accuracy`, and the compiler pointed out that the code has
always written `accuracyMiles`, in miles, because every screen shows miles.

`tsc` re-prints everything it emits, so `app/livewire.js` is reindented
compared to `src/livewire.ts`. That is cosmetic, but it is why `lint.mjs` reads
the source and `events.test.mjs` reads the build output — one checks the shape
a person wrote, the other runs what a phone will run.

TypeScript 7 always emits `"use strict"`; `alwaysStrict: false` was removed
from the compiler. That was checked rather than assumed — strict mode would
change this app if it used `this` in a plain call, `arguments`, or an octal
literal, and it uses none of the three. Everything else strict mode forbids is
already a compile error. Worth re-checking if that stops being true, because
the tests cannot: `new Function()` is not strict.

## What was actually tested, and what was not

Tested on **Windows 11 Home (build 26200)** with **Chrome 153**, served with
the real `vercel.json` headers:

- the app loads and the home screen renders, with **no CSP violations**
- the only remote requests are to Supabase — no Google origin, no CDN
- fonts load and render from `vendor/fonts-v1/`
- all 1,519 checks across the three test files pass
- each new check in `test/lint.mjs` was deliberately broken to confirm it fails
- `app/boot-guard.js` was checked both ways: silent on a healthy load, and
  showing its message when `app/livewire.js` was blocked

Tested on a **phone**, against a preview deployment, installed to the home
screen — loaded once with signal, force-quit, airplane mode, opened cold:

- **the offline shell fills and works.** The app opened with no network, drew
  itself in its own fonts out of the shell rather than system fallbacks, and
  its screens were usable.

That last one is the check this repository cannot make for itself, and it is
worth repeating whenever `SHELL_FILES` changes. Cache Storage writes are
refused outright on the machine this was built on — `cache.put` fails for
every URL, even into an empty cache — so no automated run here can watch the
shell fill. What the tests *can* prove is narrower and still worth having:
every path in `SHELL_FILES` returns 200, the worker registers and activates,
and `test/lint.mjs` fails if the page loads something the shell leaves out.

**Not verified, and you should know it:**

- **Only one mobile browser has seen this.** iOS Safari and Android Chrome
  differ most in exactly the areas this change touched - service worker
  lifetime, cache eviction and font loading - so the other one is still an
  open question.
- **A real offline → online round trip**, with conflicting edits made on
  purpose on two devices, to watch the declared last-writer-wins policy
  actually happen.
- **The v3 → v4 service worker upgrade**, which only exists on the live domain.
  A phone that picks up the new `index.html` and loses signal before caching
  `/app/livewire.js` gets the boot guard screen rather than the app. Merge on a
  quiet day and open it on a phone afterwards.

## What is still open

- **The compiler is turned down.** The first TypeScript pass was the toolchain,
  not the typing - see the table under "TypeScript" for what turning each check
  on is worth. Until then the type system is catching far less than it could.
- **`sql/` and `test/` are publicly downloadable**, and always have been:
  the whole repository root is what gets served. Nothing there is a secret -
  the anon key ships in the page by design and the row policies are enforced by
  the database, not by being hard to read - but it does hand anyone a map of
  the schema and the exact policy logic, including the rollback script. Fixing
  it means building into a directory that holds only what should be public,
  rather than serving the repository root.

- **`style-src` still allows `'unsafe-inline'`.** 218 `style="..."` attributes
  have to move to classes first - 148 in `index.html` and 70 more built into
  HTML strings by `app/livewire.js`, which are the awkward half. This is much less serious than
  the script case — it is not a path to running code — but it is the last
  `'unsafe-inline'` in the policy.
- **The app is JavaScript, not TypeScript**, and `app/livewire.js` is one
  10,400-line file.
- **`/app/` filenames carry no version**, so they are served
  `must-revalidate` and the service worker fetches them network-first. That is
  correct but it costs a request per load; content-hashed names would not.
- `favicon.ico` 404s. Harmless, but it is a 404 on every first load.
