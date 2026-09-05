# Tests

```
node test/events.test.mjs   # behaviour
node test/fish-i.test.mjs   # the serverless endpoint
node test/lint.mjs          # structure
```

From the project root. Nothing to install — they need only Node. Both exit `0`
when clean and `1` on any finding, so CI can use them as-is.

`events.test.mjs` checks what the app *does*. `fish-i.test.mjs` covers
`api/fish-i.js`, which the other two cannot reach — it runs on Vercel, not in
the page. `lint.mjs` checks what a
single-file app with no build step has nothing else to catch: a
`getElementById` naming an element nobody added, a `bindEl` on a renamed
button, an unbalanced tag, a function called but never written, a store
collection wired into the app but missed in the SQL, a `/api/...` call with no
function in `api/` to answer it, a form field under 16px. Every one of those fails silently in a
browser — no console error, just a feature that quietly does nothing.

To check a copy other than `index.html`:

```
node test/events.test.mjs some-other.html
```

## How it works

There is no build step and no module system to hook into. The test pulls the
inline `<script>` straight out of `index.html`, runs it inside a `Function()`
with stub DOM objects passed in, and the script hands its internals back through
`globalThis.__t`.

So these tests exercise **the real shipped code**, not a copy that can drift out
of sync with it. Change `index.html` and the tests see the change immediately.

## What it covers

The places where a mistake is silent and expensive:

- **Event scoping** — that the leaderboard, GPS check, Big Fish pot and payouts
  read only the live event.
- **Deletion safety** — that saving under one event cannot delete or drop
  another event's records. This is the one that matters most; the failure mode
  is a wipe with no error message.
- **The legacy fallback** — that records written before the app knew about
  events still read correctly, and that installing an update changes nothing
  until the director switches events on purpose.
- **Boundary geometry** — circle and polygon in/out, distance to the line, the
  drag-handle offset/bearing round-trip.
- **Species scoring** — that the target species is per-event and that changing
  it re-ranks the leaderboard.
- **Board codes** — that a code is never issued twice, across every event
  rather than just the live one, and that team and personal codes share one
  pool. A duplicate looks like nothing at the time; it surfaces when two
  anglers claim the same fish and the photo cannot settle it.
- **Confirmed entries.** That an entry does not score, join the Big Fish pot
  or count toward a pool until the director confirms the fee — and, more
  importantly, that an angler carrying no flag at all still counts. Reading a
  missing flag as "unconfirmed" would empty the standings of a tournament
  already under way, which is why that case is asserted directly.
- **Claiming an entry on another device** — that BOTH the board code and the
  registered phone must match, that neither can be skipped by leaving it blank,
  and that a server problem is never reported as a bad code. A code alone is
  four characters and is visible on the board in any photo the angler shows
  someone.
- **The roster gate.** `initStore()` is not awaited, so the register form is
  usable before the roster arrives — and a duplicate check against an empty
  roster passes every time. This is how one person registered twice from two
  browsers.
- **That a refused write is not cached.** `saveCollection` used to update the
  local cache whichever way the write went, so a registration the server
  rejected still looked registered on that phone while the angler was being
  told it had failed.
- **Clearing and deleting an event** — that a wipe covers every shared
  collection, takes nothing from any other event, and leaves no ids behind in
  the delete-tracking set.
- **Clean startup** — that the page's init does not throw.
- **The Fish-I vision pass** — that a hosted copy finds the server endpoint at
  all (it did not, for the whole time it was deployed), that the button stays
  hidden until the server says it holds an API key, that the director is told
  *which* thing is wrong, and that the page never sends its own prompt — an
  endpoint that took one would be a free model proxy on the director's key,
  since the page's source ships to every phone.
- **Which URLs the endpoint will fetch.** Gemini wants image bytes rather than
  a link, so the server does the fetching, and a server that fetches whatever
  URL it is handed can be pointed at addresses only it can reach. The allowlist
  in `allowedPhotoUrl()` is the whole defence, so it is tested like one.

## The 16px rule

`lint.mjs` fails any `input`, `select` or `textarea` styled below 16px,
including ones whose selector is only a class (`.edit-len`). This is not a
taste question: **iOS Safari zooms the whole page in when a focused field's
text is smaller than 16px**, and nothing zooms it back — the reader has to
pinch out, and until they do, scrolling and the fixed nav are both wrong. It
presents as "I have to zoom out to make it scroll right", which does not sound
like a font-size problem, which is why it is checked mechanically.

## What it does NOT cover

**Anything visual** — beyond that one rule. There is no browser here, so the map, the drag handles, the
camera and every screen layout are unverified by this file. After changing any
of those, open the app and look at it.

## Adding a test

Add the function you want to reach to the `globalThis.__t = { ... }` block near
the top of `events.test.mjs`, then use it as `t.yourFunction()`. Assertions are
`check(name, got, want)`.

## Checking the tests still bite

A suite that cannot fail is worse than no suite, because it reads as safety.
Break something on purpose and confirm it goes red. Known-good examples:

| Break this | Expect |
|---|---|
| Remove `.filter(isActiveEventRow)` from `cachedRows()` | 19 failures |
| Seed `loadedIds` from `allRows()` instead of the filtered set | 4 failures |
| Make `saveEventRecord` replace instead of merge | 4 failures |
| Have a routine fix clear a raised beacon | 1 failure |
| Trust `user_metadata` for director status | 1 failure |
| Key Fish-I availability off `AI_REVIEW_ENDPOINT` again | 1 failure |
| Have the page send its own Fish-I prompt | 1 failure |
| Resolve `/api/fish-i` even on `file://` | 2 failures |
| Let a claim match on the board code alone | 2 failures |
| Let a blank board code claim a codeless angler | 1 failure |
| Report a server error as a bad claim code | 4 failures |
| Read a missing `pending` flag as unconfirmed | 13 failures |
| Let an unconfirmed entry into the standings | 1 failure |
| Let an unconfirmed entry into the Big Fish pot | 2 failures |
| Count unconfirmed entries in a payout pool | 1 failure |
| Stop normalising phone numbers | 5 failures |
| Compare phone numbers in full instead of last ten | 2 failures |
| Never show the pending notice | 3 failures |
| Let registration proceed before the roster loads | 2 failures |
| Treat an offline connection as a loaded roster | 1 failure |
| Cache a write the server permanently refused | 2 failures |
| Leave wiped ids in `loadedIds` | 1 failure |
| Wipe only some of the shared collections | 2 failures |
| Check board codes against one event instead of all | 1 failure |
| Let `makeCode` hand out a code without reserving it | 2 failures |
| Leave team codes out of the code pool | 2 failures |
| Put a confusable character back in the code alphabet | 2 failures |
| Shorten a board code to 3 characters | 1 failure |
| Render a missing board code as blank | 1 failure |
| Stop escaping board codes | 2 failures |
| Set any form field's font-size under 16px | lint: 1 finding |
| Typo an element id | lint: 2 findings |
| Delete `api/fish-i.js` | lint: 1 finding |

And in `fish-i.test.mjs`, all of which weaken the photo-URL allowlist or the
prompt clamp:

| Break this | Expect |
|---|---|
| Match the photo host with `endsWith` instead of `===` | 2 failures |
| Drop the `/storage/v1/object/public/` path check | 1 failure |
| Allow any host when `SUPABASE_URL` is unset | 5 failures |
| Allow `http:` as well as `https:` | 1 failure |
| Stop stripping punctuation out of prompt input | 3 failures |
| Let `normalize()` pass unknown fields through | 2 failures |

Put it back afterwards.

That table exists because it has caught real gaps twice: replacing instead of
merging produced **no** failures until an assertion was added for it, and the
same was true of the `Authorization` header. A green run only means as much as
the last time somebody checked it could go red.
