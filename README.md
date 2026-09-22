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
node test/events.test.mjs   # behaviour  (1,433 checks)
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

`sql/`, `test/` and `src/` are served along with the app, because the site is
the repository root. That is no extra exposure: **the repository is public on
GitHub**, so they are published either way. Nothing in them is a secret - the
anon key ships in the page by design, and what protects the data is the
database's row policies, not their text being hard to find.

`app/` holds both generated and written files, which is the one muddy corner:
the `.js` in it is build output and gitignored, the `.css` beside it is
hand-written and committed. `test/lint.mjs` checks both directions against
`git ls-files`, because the filesystem cannot tell them apart.

The script and the stylesheet used to be inline in `index.html`. They are
separate files because the Content-Security-Policy no longer allows
`script-src 'unsafe-inline'`, and with that allowed the policy could not tell
the application apart from a block injected through a chat message or an
angler's handle.

**Nor does it allow `style-src 'unsafe-inline'`, so there are no `style="..."`
attributes anywhere.** There were 218 - 148 in the markup and 70 in HTML the app
builds - and each is now a class at the end of `app/livewire.css`. Injected CSS
cannot run code, but it can restyle the page: hide a warning, dress a link up as
a button, leak an attribute a character at a time through background images.
Setting `element.style` from code is a different thing - the policy allows it,
and it is how the app shows and hides things.

The classes are `!important`, because an inline style beat every rule in the
file and a plain class would not; `.start-hidden` is the one exception, since
the app shows those elements by setting `style.display` and an `!important`
class would keep them hidden for good. The move was checked by snapshotting
every element's box and styling on every screen and director tool - phone and
desktop, light and dark, the FWP report as it prints, 81 states and 175,285
element snapshots - before and after: **identical**, and nothing blocked by the
policy. Two runs of the unchanged app were compared first, to prove the
comparison itself had no noise. `test/lint.mjs` now fails on a style attribute
in the markup or in the app's HTML, on `setAttribute('style', ...)`, and on
`'unsafe-inline'` back in `style-src`.

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

**Most of the way there, one check at a time.** The first pass changed the
toolchain without changing the app. The second turned on `strictNullChecks`,
the check that asks the question most worth asking of this app: does the code
make sure a thing is there before it uses it? The third turned on
`noImplicitAny`: every value has a type the compiler can check, rather than one
it had to assume.

| Check | State | Findings |
|---|---|---|
| `strictNullChecks` | **on** | 524 when switched on, all resolved rather than silenced |
| `noImplicitAny` | **on** | 984 when measured, typed an area at a time, all resolved |
| `noUncheckedIndexedAccess` | **in progress** | 200 when measured; none left, all four areas done |
| `+ the rest of strict, and the unused checks` | | 27 running total |

The counts do not simply add up - each check changes what the next can infer -
so they are running totals, measured against the source as it stands.

### What strictNullChecks changed, and what it did not

**Nothing on an intact page.** Every change is either erased at compile time or
takes the same path the old code did whenever the thing being checked is there.
All 14 screens, all 8 director tools, the boundary editor, the FWP report form,
the camera controls and the photo canvas were walked in a real browser
afterwards, with no exceptions.

What it changed is **what a failure says**. Two small helpers carry most of it:

- **`pageEl('reg-name')`** finds an element the page is built to have. In 169
  places the code reads an element straight away without checking it
  was there, because it is in `index.html` and always has been. If one ever goes
  missing, the phone now says *LiveWire cannot find #reg-name* instead of
  *Cannot read properties of null (reading 'value')*, which named nothing.
  Elements that are sometimes absent - the error banner, the update prompt, the
  director's edit form - still use `getElementById` and check the result.
- **`context2d(canvas)`** gets a drawing surface for the photo pipeline. The
  browser is allowed to refuse one, and genuinely does on a phone short of
  memory - which used to fail part-way through filing a catch with a message
  about `drawImage` of null.

**`pageEl` cannot be tested by the test suite**, and that is worth knowing. The
fake DOM in `events.test.mjs` invents an element for any id it is asked for, so
`pageEl` never throws there. What stands between a mistyped id and a phone that
fails at startup is `test/lint.mjs`, which checks every `pageEl` id is a plain
literal, is in `index.html`, and is not one of the elements the script builds
for itself. Each of those three was broken on purpose to confirm it fails.

The compiler found two more mistakes in types drafted during the first pass:
`ReportDayRow.hours` is null when the clock times do not make a span, not
always a number; and until a boundary was written down as one of three shapes,
nothing could see that a circle always has a centre.

### Placeholders, while they were needed

Turning on strictNullChecks made every empty `[]` infer as a list that could
hold nothing, and the real element types were the next pass's job. So two
named stand-ins held the place, rather than plain `any` - `noImplicitAny` only
reports an `any` nobody wrote, and a plain one would have been invisible to it
for good:

- **`Unshaped`** - exactly `any`.
- **`UnshapedObject`** - an object of unknown fields, but never null by itself.
  `Unshaped | null` would not have done: a union with `any` is just `any`, and
  would have switched null-checking off for the app's nullable state - the
  backend, the Supabase client, the boundary being drawn.

`test/lint.mjs` counted them on every run, from 48 down to none, and **both
are gone now**. Every one was replaced by the shape it actually holds, and the
names were deleted when `noImplicitAny` went on, so writing one again does not
compile.

**`MaybeId`** stays: it is a real type, not a stand-in. It is the id of
whatever is selected, or nothing, in both of nothing's forms - reset to `null`
in code, and read as `undefined` from a missing `data-` attribute.

**A hand-written `any` is a lint finding.** `noImplicitAny` reports every `any`
the compiler had to assume, and says nothing about one somebody wrote -
`const x: any[] = []` compiles clean with it on. So `test/lint.mjs` fails on
one anywhere in `src/` or `types/`, apart from a short named list of things
that come from outside and ship no types of their own: `L`, `supabase`,
`claude`, what Leaflet hands back, and the data layer's record fields, which
are loose on purpose. Five were planted - at the start, middle and end of the
app, in the boot guard, and in the types - and all five were caught.

### noImplicitAny, one area at a time

`noImplicitAny` is a single switch, but the typing behind it did not have to be
one change. It was done area by area with the switch still off, each area its
own PR and the count falling as it went, and the last PR turned it on once
there was nothing left for it to find:

1. **The data layer.** Sync, the outbox, both backends, the caches.
2. **Anglers and catches.** Registration, submission, the leaderboard, scoring.
3. **The director's tools.** Payouts, results, the FWP report, the boundary.
4. **Everything else.** The trophy case, gallery, highlight reel, chat, side
   bets, positions, beacons and the maps.
5. **The switch.** On, with nothing for it to report.

**Switching it on changed nothing the app runs.** The built `app/livewire.js`
is byte for byte the file production was already serving. Three more things
went with it:

- **Eleven fields drafted as `any` in the first pass got their shapes** - a
  report day's number, date and clock times, and an event record's presenter,
  prefix, dates, time zone, species and course. `noImplicitAny` could never
  see those, because somebody wrote them. The compiler agreed with every one:
  nothing in the app had to change.
- **The boot guard lost its one cast to `any`.** It compared a script element
  with `window` to rule out an ordinary uncaught error; it compares the event's
  target instead, which is the same object. Its failure screen was checked in a
  real browser with the app blocked, and still says which file did not arrive.
- **The two placeholder names were deleted**, and a hand-written `any` became a
  lint finding - see above.

**The data layer went first because a wrong shape there loses a catch.** It
now has a written contract, where before it had two backends that had to agree
on one nobody had written down:

- **`Backend`** - everything a backend offers the app. Both
  factories are declared as returning one, so the compiler now checks that the
  tournament server and the Claude viewer's store agree. Nothing did before.
- **`OutboxOp`** - a write waiting for signal, in exactly one of three kinds:
  `set`, `delete` or `photo`. A delete has no body, and code that reads one
  now has to say which kind it found.
- **`CollectionName`** - the six shared collections plus `config`, as a
  fixed list rather than any string.
- **`SupabaseClient`** and **`ArtifactDb`** - the two outside libraries,
  described only as far as the app calls them. Each was written by reading
  every call, so it cannot drift on a method the app has never used.

`Row` - a stored record, any fields plus its id - is loose on purpose, and not
a placeholder. The data layer moves records without looking inside them; what a
catch or an angler carries belongs to the code that reads one, and gets typed in
the next area.

Typing this one layer cleared 224 findings across the whole app, not the 80
inside it: once `loadAnglers()` returns records, everything downstream of it is
typed too.

**What the compiler found:** `AuthSession` was first drafted with only `user`
and it rejected that four times; the viewer's `onSnapshot` takes an error
handler the first draft left off; and `readOutbox()` is now openly a trust
rather than a guarantee - the outbox comes back out of local storage, which an
older build may have written in a different shape, so the code reading it still
checks the fields it depends on.

**The Claude viewer's store now has a test.** It had none: it only switches on
inside Claude, which no test and no browser ever reaches. The test checks that
rows arrive with their ids and are copies the app can change - the viewer hands
out frozen objects, and writing to one throws. Removing the copy fails seven of
its checks.

**Anglers and catches** got real types of their own: `Angler` and `Catch`,
each built from the literal that creates it - registration, submission - and
then from every field the compiler found the app writing later. That area went
from about 190 findings to none, and `noImplicitAny` across the app from 760 to
563.

The compiler **caught my first drafts wrong, repeatedly** - nine types outright,
plus fields they missed - which is the case for writing these down at all.
Among them:

- `pending` on an angler is deleted rather than set false - present means
  unpaid, absent means paid - so it is optional, not the required flag I wrote.
- `precheck` on a catch is the photo's *measurements*, not the first-pass
  verdict I modelled it on. The verdict is worked out from them and never
  stored, and its levels - clear, review, flag - are not the checks' levels.
- `makeCode()` gives up and returns null when it cannot find a free code, so an
  angler's code can genuinely be missing.
- A photo's clock skew is null until the device has heard the server's time,
  and the stamp says so rather than guessing.

It also found the reverse, **places where my annotation was stricter than the
code**: `displayHandle`, `photoIntegrity` and `stillEditable` were all written
to cope with something missing, and say so on their first line.

**And it found a real bug** - fixed in its own commit, with a test. A director's
second target species was never scored: `eventSettings()` left the saved species
list behind, so everything asking for it - scoring, the leaderboard, payouts,
the results and the director's own editor - saw the first species only. The
second vanished from the list as soon as it was saved. No live impact, since the
only event is walleye. The type error that exposed it was the bug; there was no
honest way to make it compile without fixing it.

`actionGuard` now says what it has always meant: four outcomes rather than a
yes or no, because one refusal - "not yours" - still carries an angler. Checking
`ok` is enough for the compiler to know an angler is present, which is what
filing a catch relies on; the compile proves the guard never passes without one.

**What the browser could not reach.** The photo path's edits - the slot
ordering, the mismatch note, reading an upload once - only run when a catch has
a photo, and production has none. Each is identical by construction, and none
is covered by a behaviour test. Proving them needs a catch filed with a photo,
and the preview shares production's database, so that is real data;
`sql/reset-test-data.sql` clears it afterwards.

**The director's tools** went from 235 findings to none, and `noImplicitAny`
across the app from 563 to 301. Placeholders fell from 32 to 13; the one left in
this area is Leaflet's own map object, which stays as honest as Leaflet does.

Two of the biggest shapes are **derived rather than written out**:
`ReportModel` is `ReturnType<typeof buildReportModel>` and `ResultsRecord` is
`ReturnType<typeof buildResults>`. The screen, the printed sheet and the copied
text all read the report from one object, and a frozen result has to match a
freshly built one - a second hand-written copy of either shape would be exactly
the kind of thing that drifts.

What the compiler corrected, this time:

- `isScoringSpecies` takes a species **or a list of them**. A frozen result
  stores a list, but one frozen by an older build stored a single name, and the
  function has always handled both. I had typed it as taking one.
- A frozen result keeps a **slimmer row** than the live standings - who, their
  best and their top three - because it is permanent and shows only that.
- The boundary being drawn is **not a Boundary**. A saved boundary is one
  shape; a draft keeps what it has of every shape, so switching a circle to an
  outline and back does not lose the centre. It has a type of its own.
- `boundaryIsUsable` now tells the compiler what "usable" has always meant: a
  circle with a real centre and radius, or an outline of three corners or more.
- A contestant's `best` is a length in inches, not a catch; a size row can be
  split across both FWP tables; every setup to-do counts down to registration
  close.

Two changes worth knowing about, both identical in behaviour:

- **Clearing an event cannot run without an event id**, and now says so where
  the compiler can see it. It never could - a missing id found no event and
  returned a line later - but this is the one action there that deletes.
- The review buttons check for a catch id **only where one is used**, not at the
  top: the same handler serves the Fish-I retry button.

And two of my own tools were wrong, both caught before they did harm. The script
that annotates parameters turned `.map(id=> ...)` into `id: string=>`, which
is not valid - the compiler refused it as a syntax error. And **lint's check for
calls to functions that do not exist had quietly stopped recognising every typed
parameter**: its pattern read `act: string` as not-a-name. It only surfaced when
a typed parameter was *called*; it finds parameter lists by matching brackets
now, and still catches a genuinely missing function.

**Everything else** went from 301 findings to none, which is the whole app:
`noImplicitAny` finds nothing left to report. The last 13 placeholders went
with it.

**The last three shared collections have shapes.** `ChatMessage`, `Bet` and
`BetJoin`, and `Signal` - a position, or a beacon - are each written from the
one place that creates them. All six collections now load as records the
compiler knows; `Row` is only the data layer's own type, as it was meant to be.

The screens' own shapes are **derived from what builds them**, like the report
and the results before them: a trophy-case line, the trophy case's totals, a
gallery tile and a reel's running order are each the return type of the
function that makes one.

**The gallery's privacy rule is now enforced by the compiler.** A gallery tile
is a projection of a catch that leaves the angler's real name out, so nothing
can put it on the wall - and that tile is now a type. Code that reads
`anglerName` off a gallery tile, or off a shot in the highlight reel, no longer
compiles. Putting a real name on a gallery tile was tried on purpose, and
refused.

What else the types now hold:

- A catch card's badge is one of **four tones, and each has a colour**. The
  compiler checks both ways: no badge in a colour that does not exist, and no
  colour missing for a badge that does.
- A side bet is a `bet` or a `join`, told apart by `kind`. **Only called
  bets** reach a frozen result or the trophy case, and that test is now written
  once, in `betIsSettled`, rather than twice.
- **Leaflet stays untyped, under a name.** It ships no types and this app
  installs none, so what it returns is as unknown as `L` is. `LeafletObject`
  says which library a value came from without guessing at its methods.

What the compiler corrected, this time:

- A reel scene's first draft **grouped the title and end cards together**, and
  that hid every shot from the compiler: a check for "title" could not rule out a
  card that might be either. They are one kind each now.
- **A chat message's author can be null.** The code that announces a catch
  allows for there being no angler to name, so the type does too, and the feed
  checks before looking an author up. It changes nothing on screen - a missing
  author was never found anyway.
- `normPhone` already turned a missing number into an empty one on its first
  line. Its type now says so.

Changes worth knowing about. None alters anything the page does today:

- **A link or tab with an empty target does nothing** rather than switching to
  a screen that does not exist, which would have left the app blank. The page
  has none; this only matters if one is ever added.
- **A side-bet button with no bet id** returns before loading anything. It found
  no bet and returned a line later before.

**And a tie in a "most fish" side bet now goes to whoever got there first** -
fixed in its own commit, with tests, at the director's call. Typing that code
meant checking what it did on a tie, and the answer was: whichever catch the
server happened to send first. Every other ranking in the app breaks a tie on
the earliest fish, because arrival order changes when a row is updated - see the
note above `byLengthThenEarliest` - so two phones could name different leaders
for the same bet. Now more fish wins, a tie on the count goes to the angler who
reached it first, and the leader's line says "got there first" when that is what
decided it. The earliest-then-id rule is `byEarliest`, written once and shared
with the "first fish" bet. Four of the six new tests fail against the old code,
including one where it named a different leader depending only on the order the
same two catches arrived in.

**One thing the tests cannot tell apart yet.** The live database is empty until
there is a tournament in it, so a browser pass against production syncs every
collection and gets no rows back. "Every row has an id" is then true of nothing.
The behaviour tests are what carry real rows through the merge - breaking it
fails two of them - so they, not the empty production sync, are the evidence.

Worth knowing before you start: `noUncheckedIndexedAccess` on its own reports
nothing at all, because it has no effect without `strictNullChecks`. And a CLI
`--strict` will *not* override a check that `tsconfig.json` turns off by name -
the specific setting wins over the umbrella one, whichever side it is written
on. That caught this project out while `noImplicitAny` was still `false`, and
it is worth remembering whenever a run comes back suspiciously clean.

Most of what the rest of `strict` adds is catch variables: it types `catch(e)`
as unknown, so each handler has to check what it caught before reading
`.message` off it. The unused checks already find four real ones: `nameEl`,
`recEl` and `catches` are declared and never read, and so is one callback's `e`.

Along the way the `any`s in `types/globals.d.ts` — `L`, `supabase`, `claude` —
should get real shapes. They are honest `any` for now rather than an invented
type that reads as verified when nobody checked it, and lint holds them to that
named list.

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
already a compile error.

**And the behaviour tests run strict too, every time.** The compiled file opens
with `"use strict"`, and the test harness passes that file as the *body* of
`new Function()`, where a directive at the top applies. So all of them exercise
the app exactly as a phone does. An earlier version of this section said the
tests could not see strict mode at all; that was wrong, and it understated how
much the suite covers rather than overstating it.

### noUncheckedIndexedAccess, one area at a time

Without this check TypeScript assumes every `list[0]` and every `lookup[id]` is
there. That assumption is how *Cannot read properties of undefined* reaches a
phone: the first catch of a day that has none, an angler id that matches nobody
on the roster. 200 findings when measured, done the same way as the last check
- area by area with the switch off, the switch last:

1. **The data layer and the event lookups** - done. The code every screen reads
   through: which event is live, its dates, its species, a catch or an angler
   by id. 18 findings, none of them a crash in practice.
2. **The photo checks** - done. The stamp, the encode ladder, the fingerprints,
   the first pass, the camera guide and Fish-I's prompt. 59 findings, again
   none a crash in practice.
3. **Anglers, catches and scoring** - done. Check-in, the overdue list, an
   angler's own catches, standings and rank, side bets, the trophy case and
   chat. 29 findings, and one real gap found beside them - see below.
4. **The director's tools, and everything else** - done. The course map and
   the boundary editor, the state report, payouts, donations, species, the
   event form, review and Fish-I, contestants, the highlight reel, the home
   tiles and the overdue alert. 88 findings, none of them a crash in practice.
   Then the switch.

The rules this pass follows:

- **No `!`.** It tells the compiler to stop asking, which is the opposite of
  the point. Every read either proves the item is there, or says what happens
  when it is not.
- **A list that is never empty says so in its type.** `EVENTS`, the built-in
  events, is now "one event, then any more". Four `EVENTS[0]` reads - the legacy
  id, the default, two fallbacks - are settled at once, and the compiler holds
  the list to it.
- **A first or last item after a length check is taken out and checked once.**
  The same test, in a form the compiler can follow.
- **A counting loop that only reads the current item becomes `for...of`.** Same
  items, same order.
- **A lookup that can miss is handled where it misses.** Those are the ones
  this check exists to find.
- **A pixel read inside the frame gets `?? 0`.** The fingerprint and camera
  loops only ever index inside the image, so the fallback never applies and
  never changes a value. It is how the type system hears that; `NonEmpty<T>`
  and `FrameWindow` say the rest - a list with a first item, and a photo window
  that is always four numbers.

**The photo checks had to come out identical to the bit, and did.**
Fingerprints are compared against catches from earlier events, so a hash that
moved by one bit would quietly break duplicate detection across years. The old
build and the new were run on the same generated photos - eight of them,
including two crops - and compared value by value: every fingerprint, the
brightness and focus, the shrunk-and-stamped photo itself, 64 fingerprint
comparisons, six first-pass verdicts (a duplicate, a crop, a photo from another
event, an implausible length), nine frames through the camera guide, and 60
random handles from the same random numbers. **All identical.** Two of lint's
checks read the window code by its wording and now allow a type annotation;
both were broken on purpose afterwards to confirm they still catch a real fault.

**Scoring was held to the same standard.** The old build and the new were run
side by side on 20,000 random tournaments - ties on purpose, catches with no
timestamp, teams, disqualifications, every kind of side bet - through the
standings, every angler's rank, every bet's leader, the trophy case, initials
and the overdue list: 399,930 results, **no differences**.

**And area 3 turned up a real gap: check-in was written for a two-day event.**
The event form accepts one to seven days, but registration made `day1` and
`day2`, the check-in screen drew two rows, and the director's contestant summary
said D1 and D2. On day 3 of a longer event nobody could check in - so the
overdue list, which does read the event's dates, could never name anybody still
on the water that evening. That is the one list in this app that exists for
safety. A one-day event showed a second row with no date.

Fixed in its own commit, with tests: `eventDayKeys()` is the one place that
names the days, one per date in the live event, and registration, the screen
and the summary all read it. A day's record is made the first time it is used,
so an angler registered before a day was added can still check in on it. The
screen also stopped treating a record with no check-ins at all as a crash - the
button always allowed for one; the screen never did. No live impact: both
built-in events are two days, and are exactly as they were. Against the old
behaviour, six of the new checks fail and the seventh crashes outright checking
in on a day the record has no entry for.

**Area 4 was checked the same two ways.** The parts that are pure calculation -
whether a point is inside the course and how far from its edge, where a map
opens, each home tile's colour, the reel's running order, the payout split to
the cent, hours fished per day, typed boundary corners, the video format picked
and the director's to-do list - were run on the old build and the new on 20,000
random rounds: 417,792 results, **no differences**. The same comparison run
against a copy of the new build with two small faults planted found 1,045, so
a clean result means something. Where both builds throw, on an event course
record missing its corner list entirely, the count is reported on its own.

The screens were compared too: all 81 states the style change was checked
against - every screen, every director tool, the report printed, dark mode -
snapshotted on both builds with the database and map tiles blocked at the
browser, 175,285 elements, **identical**.

Two of lint's checks read the code by its wording - the lightbox wiring table
and the tile palette - and one test pinned the director's edit form by a
variable name. All three now find what they guard however it is written, and
each was broken on purpose afterwards to confirm it still fails.

## What was actually tested, and what was not

Tested on **Windows 11 Home (build 26200)** with **Chrome 153**, served with
the real `vercel.json` headers:

- the app loads and the home screen renders, with **no CSP violations**
- the only remote requests are to Supabase — no Google origin, no CDN
- fonts load and render from `vendor/fonts-v1/`
- all 1,535 checks across the three test files pass
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
- **The same, for the stylesheet.** The page and `/app/livewire.css` are both
  fetched fresh on every open, so a mismatch needs signal to drop between the
  two: new markup with last deploy's stylesheet. Since the styles moved into
  classes, that one open would show everything meant to start hidden - empty
  error lines, the director panel's buttons under its lock - until the next
  open with signal fetches the stylesheet. Cosmetic: hiding the director panel
  was never what protected it - anyone can show it from a browser's inspector -
  and what it can change is for the database's row policies in `sql/` to
  decide. Still a reason to deploy away from a tournament.

## What is still open

- **Two of the compiler's checks are still off.** `strictNullChecks` and
  `noImplicitAny` are on; `noUncheckedIndexedAccess` and the rest of `strict`
  are worth about 115 more findings between them, and the first of those is
  under way - see the table under "TypeScript".
- **The app is one 10,600-line file**, `src/livewire.ts`, in one global scope.
  Splitting it means modules, which the test harness cannot run - see
  "TypeScript" for why.
- **`/app/` filenames carry no version**, so they are served
  `must-revalidate` and the service worker fetches them network-first. That is
  correct but it costs a request per load; content-hashed names would not.
- `favicon.ico` 404s. Harmless, but it is a 404 on every first load.
