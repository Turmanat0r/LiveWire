# Tests

```
node test/events.test.mjs   # behaviour
node test/lint.mjs          # structure
```

From the project root. Nothing to install — they need only Node. Both exit `0`
when clean and `1` on any finding, so CI can use them as-is.

`events.test.mjs` checks what the app *does*. `lint.mjs` checks what a
single-file app with no build step has nothing else to catch: a
`getElementById` naming an element nobody added, a `bindEl` on a renamed
button, an unbalanced tag, a function called but never written, a store
collection wired into the app but missed in the SQL. Every one of those fails
silently in a browser — no console error, just a feature that quietly does
nothing.

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
- **Clean startup** — that the page's init does not throw.

## What it does NOT cover

**Anything visual.** There is no browser here, so the map, the drag handles, the
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
| Typo an element id | lint: 2 findings |

Put it back afterwards.

That table exists because it has caught real gaps twice: replacing instead of
merging produced **no** failures until an assertion was added for it, and the
same was true of the `Authorization` header. A green run only means as much as
the last time somebody checked it could go red.
