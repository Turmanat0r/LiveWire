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
function in `api/` to answer it, a form field under 16px, the same function
declared twice. Every one of those fails silently in a
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

- **The browser's own Back button.** The app is one page pretending to be
  thirteen, and the browser had no idea: Back from three screens deep left it
  altogether — out to whatever was open before the tournament, or, installed to
  a home screen, to a dead stop. Every screen change now writes a history entry.
  The tests cover the three ways that goes wrong: pushing an entry the history
  *itself* just delivered (Back sticks and never moves), pushing on a re-tap of
  the screen you are already on (the stack fills with copies and Back appears
  dead), and replacing instead of pushing (there is nothing to go back to).
  The screen lives in the **hash**, not a path — the app is one static file, and
  a real path would 404 on a hard refresh unless the host rewrote it, which is a
  deploy setting waiting to be forgotten. `screenFromHash` is fed straight off
  the address bar, so it treats anything it does not recognise as *no opinion*
  and falls to home; it is tested against a script payload and a path traversal
  for the same reason.
  None of it is required: a `file://` page throws `SecurityError` on
  `pushState` in several browsers, so failing to *record* a move must never stop
  the move happening. Tested with a history API that throws on every call.
- **Back closes the photo panel.** The pop-out takes a history entry of its own,
  so Back shuts the photo rather than leaving the screen behind it — what every
  phone gallery does. One entry for the panel, not one per fish, or walking the
  arrows would leave a trail to press Back through afterwards. The Close button
  goes through `history.back()` too, so the button and the Back button are one
  action: closing any other way would leave the entry on the stack and the next
  Back would appear to do nothing at all.
- **What the public wall may say.** The fish gallery shows every approved catch
  in the event, the viewer's own first. It is the whole field looking at each
  other's fish, so the angler there is a **handle** — and `galleryOrder` enforces
  that by shape rather than by discipline: it returns a *projection* of each
  catch, not the record, so `anglerName` is not in the object and there is
  nothing to leak however a tile is later rendered. The test asserts no real
  name survives into the output, and lint refuses any mention of `anglerName`
  inside the three gallery functions.
  Approved only: a pending fish may still be rejected, and hanging a rejected
  one on the wall makes an angler argue with a director's judgement in public.
  A disqualified angler's fish come off, same as the leaderboard.
- **One pop-out, two audiences.** The director's review lists and the public
  gallery open the same panel, and it must not show them the same thing — real
  names, the boundary verdict and the clock-skew flags are review notes on a
  fish already judged. The mode is read on every paint, an unrecognised mode
  falls to the **public** side (a typo at a call site should cost a director
  some detail, never publish a name), and the verdict buttons are checked
  against the mode again before they write. Tested in both directions, plus the
  case that matters most: a *pending* fish opened publicly still offers no
  approve button.
- **Newest-first needs the opposite sentinel.** `catchTime` makes an undated
  catch enormous so it sorts *last* in an earliest-first tie-break. The gallery
  sorts newest-first, where that same value would send an undated fish to the
  *top of the wall*, above everything real. `galleryTime` floors it to zero
  instead, so a record missing its timestamp sinks either way.
- **Who may act for an entry.** Every angler picker is scoped to the entries
  this device is signed in to; only the director sees the whole field. A device
  with no registration used to be handed the *whole field* instead — the
  reasoning being that a wiped phone had no way back to its entry and being
  locked out mid-event was worse than the exposure. There is a way back now
  ("Sign in to my entry"), so that had stopped being a trade-off and become an
  open door: anyone who opened the link could read, re-measure and withdraw
  other people's catches. It now offers nobody and says how to sign in. The
  write path checks `canActFor` again against a fresh roster before it saves,
  because a `<select>` is markup in a page anyone can open the inspector on — a
  lint rule fails the build if that check leaves `renderManageList`, which has
  no test that can see it.
- **Who may delete a message.** The author, or the director, and nobody else.
  It used to read `ctx.mine`, which covers *both halves of a team* — right for
  "show this as mine", wrong for "let this device delete it", and it let either
  half of a team clear the other's messages. `canDeleteMessage` is now shared by
  the button and by the write, and the handler re-checks before deleting; the
  team-partner case is asserted directly, since that is the one that was broken.
- **One verdict, one place.** `reviewCatch` applies approve, reject and delete
  for both the list buttons and the full-size photo panel. Two copies of "what
  reject means" is how a fish ends up rejected on one screen and approved on
  another. An unknown action changes nothing rather than falling through to a
  default, and a catch that has since gone is refused rather than reported done.
- **Ties, and that they never follow row order.** Two anglers can land the same
  length — a bump board reads to the quarter inch. Ranking on length alone left
  the order to however the rows happened to arrive, and rows arrive in whatever
  order Postgres feels like: an order that *changes when a row is updated*. So
  approving one catch could silently reorder a tie somewhere else, and two
  phones could show different boards from identical data. The rule is now
  **earliest fish wins**, and the tests assert it in both directions and with
  the input reversed, because "same data, same answer" is the whole point. A
  missing timestamp sorts last rather than first — a blank field must never win
  a tie — and the id settles the impossible case so the order is total.
  `byLengthThenEarliest` is shared by the leaderboard, Big Fish, the winning
  fish on the state form and the angler's own list, so those can never disagree
  about who won; a lint rule fails the build if any ranking sorts on length
  alone, because `renderBigFish` has no test around it to notice.
- **Reading a table that outgrew one response.** Supabase caps how many rows one
  response carries and truncates **silently** — a short read is an ordinary 200
  and looks exactly like a small table. The catches table grows with every event
  held, so without paging, fish would simply stop reaching the leaderboard a
  season or two in, with nothing anywhere to say why. The tests page a 2500-row
  table, then do it again against a server that caps pages *below* the requested
  size (stepping by what was asked for instead of what came back would skip
  every row in the gap), and check the count header is used so there is no
  wasted final read on every poll.
- **Splitting a pool without losing a cent.** 50/30/20 of an odd pool does not
  divide evenly, and rounding each share on its own handed out a cent more than
  the pool held — or stranded one. It is now worked in whole cents with the
  leftovers going to the largest remainder. Swept across every pool from
  $100.00 to $150.00 in one-cent steps, the parts add up to the whole exactly.
  An unfilled place is asserted *not* to be redistributed: it stays unawarded
  and the screen says so, because spreading it would quietly pay 2nd place more
  than the rules promise.
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
- **Fees, and what they no longer decide.** An entry with no payment matched to
  it *scores, places, holds the winning fish and stays in the Big Fish pot* —
  what it does not do is count toward a pool, because a pool is money that
  arrived. That is a reversal: the flag used to gate the standings, which meant
  a tick the director missed showed up as an angler asking why their fish was
  not on the board, mid-event, at a ramp. Eligibility is `disqualified` and
  always was. The tests assert the new rule in both directions, because putting
  the old gate back is a two-character edit in five places.
  Also that an angler carrying no flag at all reads as **paid** — reading a
  missing flag the other way would empty the pools of a tournament already
  under way.
- **What the public roster may say.** It lists handles and nothing else. It used
  to print "unconfirmed" beside a handle, which published one angler's payment
  status to the whole field; there is now a test that the roster mentions no
  fee state and no real name, because that is a leak that reads as a harmless
  label right up until someone notices.
- **Claiming an entry on another device** — that BOTH the board code and the
  registered phone must match, that neither can be skipped by leaving it blank,
  and that a server problem is never reported as a bad code. A code alone is
  four characters and is visible on the board in any photo the angler shows
  someone.
- **Who is still on the water.** That the overdue alert stays silent before the
  deadline and off event days, never lists someone who did not launch, reads
  the right day, and sorts by who was last seen rather than by name. Getting
  this wrong is either a false alarm or a search that starts too late.
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
- **The Montana FWP contest report.** It goes to the state, so the rule it
  follows is that it never guesses: residency asked rather than defaulted, a
  count that had to leave records out saying which ones, deaths clamped so a
  released figure can never go negative, the 30 days running from the last day
  fished, and each fish appearing on exactly one of the form's two overlapping
  size tables. The overlap is the subtle one — taken literally the form asks
  for a 15" walleye in both.
- **The timestamp burned into a submission photo.** That it is drawn *after*
  the image and *inside* the encode loop — a stamp painted under the photo, or
  drawn once outside a loop that redraws the canvas per rung, produces a file
  that saves cleanly and carries no time at all. Plus that the app knows the
  difference between a clock it has checked against the server and one it
  hasn't, and never states a bare time for the second.
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

## The CSP is in Report-Only, on purpose

`vercel.json` carries the security headers. Everything in it is enforced except
the Content-Security-Policy, which ships as `Content-Security-Policy-Report-Only`.

That is the normal way to introduce a policy to an app that already exists: it
reports what it *would* have blocked to the browser console and blocks nothing,
so a policy that turns out to be a line too tight cannot take the app down at a
boat ramp. The origins in it were read out of `index.html` rather than guessed —
jsDelivr, Google Fonts, `tile.openstreetmap.org`, Supabase — and a lint rule
fails the build if the page ever loads from somewhere the policy does not name,
so it cannot quietly fall behind the code.

**To turn it on:** open the app on a phone and on a laptop, visit every screen
that touches the network — the map and boundary editor, the camera, a catch
submission, the payout screen, the FWP report — and watch the console. If
nothing is reported, rename the key to `Content-Security-Policy` and redeploy.
Do that between events, never during one.

`script-src` has to keep `'unsafe-inline'`: the whole app is one inline
`<script>`, and the alternative is a hash that changes on every edit, which with
no build step is a thing that would silently rot.

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
| Raise the overdue alert before the check-in deadline | 2 failures |
| List anglers who never checked in as overdue | 3 failures |
| Read day 1's check-out on day 2 | 2 failures |
| Sort the freshest position first instead of the oldest | 1 failure |
| Treat "no position ever" as a fresh one | 1 failure |
| Read a missing `pending` flag as unpaid | 13 failures |
| Put the fee gate back on the standings | crash |
| Put it back on the Big Fish pot | crash |
| Put it back on the winning fish | 2 failures |
| Put it back on the state's angler count | 1 failure |
| Put it back on the contest hours | 1 failure |
| Put it back on the residency count | 2 failures |
| Stop the fee flag gating the payout pools | 3 failures |
| Bill a team twice for one entry | 2 failures |
| Bill Big Fish per entry instead of per angler | 2 failures |
| Drift `FEE_SOLO` from the pool maths | 1 failure |
| Flag the whole field, not just the places that pay | 2 failures |
| Never check the Big Fish leader | crash |
| Flag a paid angler as owing | 5 failures |
| Tell the angler their catches do not count | 2 failures |
| Print fee status on the public roster | 1 failure |
| Remove the tie-break, leaving ties to row order | 7 failures |
| Give a tie to the latest fish instead of the earliest | 5 failures |
| Drop the id fallback, so untimed ties float | 1 failure |
| Skip best-3, so depth stops counting | 1 failure |
| Read `bestAt` off the first fish logged, not the best one | 1 failure |
| Sort a missing timestamp first, so a blank field steals ties | 3 failures |
| Let `catchTime` return NaN for junk | 3 failures |
| Keep only lengths in the group, losing the timestamps | 5 failures |
| Rank the winning fish on length alone | 2 failures |
| Rank Big Fish on length alone | lint |
| Rank the angler's own list on length alone | lint |
| Pick the unpaid Big Fish leader by a different rule | lint |
| Rank the smallest-fish bet largest-first | 3 failures |
| Drop the smallest-fish bet's tie-break | 2 failures |
| Remove paging, so a big table truncates silently | 8 failures |
| Drop the `order` clause, so pages stop lining up | 1 failure |
| Advance the offset by the page size asked for | 2 failures |
| Stop on the first short page | 2 failures |
| Read the count from the wrong side of the slash | 1 failure |
| Cap `SYNC_MAX_PAGES` at one | 8 failures |
| Drop the id when reading rows back | 3 failures |
| Remove the in-flight guard, so ticks overlap | lint |
| Put the loop back on `setInterval` | lint |
| Remove the hidden-page check | lint |
| Flatten the backoff to a fixed 5s | lint |
| Never count or never reset failures | lint |
| Read a table with no `limit` | lint |
| Float supabase-js back to `@2` | lint |
| Drop an integrity hash, or its `crossorigin` | lint |
| Delete `vercel.json`, or any header in it | lint |
| Let the CSP fall behind an origin the page uses | lint |
| Cache `sw.js` for a year | lint |
| Revoke the page's own camera permission | lint |
| Put the floating-point payout split back | 4 failures |
| Strand the leftover cents, or round shares up | 4 failures |
| Give leftover cents to the smallest remainder | 1 failure |
| Redistribute an unfilled place across the rest | 3 failures |
| Drift the split off 50/30/20 | 10 failures |
| Let a negative pool produce a negative payout | 1 failure |
| Truncate cents instead of rounding | 1 failure |
| Hand an unlinked device the whole field again | 3 failures |
| Stop scoping the picker at all | 7 failures |
| Take the full field away from the director | 1 failure |
| Let `canActFor` approve anyone | 2 failures |
| Drop the ownership check from a catch edit | lint |
| Put chat delete back on the team-wide set | 2 failures |
| Let anyone delete any message | 7 failures |
| Stop the author deleting their own | 2 failures |
| Count a missing identity as a match | 1 failure |
| Take moderation away from the director | 2 failures |
| Drop the re-check from the chat delete handler | lint |
| Make reject quietly approve | 2 failures |
| Let an unknown verdict save anyway | 1 failure |
| Have reject delete the catch instead | crash |
| Report a vanished catch as handled | 2 failures |
| Drop the review tool from the switcher | crash |
| Return the catch records instead of the gallery projection | 2 failures |
| Print a real name on a gallery tile | lint |
| Show a real name in the public pop-out | 5 failures |
| Treat an unknown pop-out mode as the director's | 3 failures |
| Republish the boundary verdict to the field | 1 failure |
| Wire the gallery grid to director mode | lint |
| Offer approve and reject to a viewer | 2 failures |
| Put pending or rejected fish on the wall | 6 failures |
| Leave a disqualified angler's fish on it | 3 failures |
| Stop putting the viewer's own fish first | 4 failures |
| Order the wall oldest-first | 4 failures |
| Drop the gallery's id tiebreak | 1 failure |
| Let an undated fish top the wall | 3 failures |
| Hand NaN to the gallery comparator | 2 failures |
| Show arrows with nowhere to go, or live at either end | 1 failure |
| Count the position off by one | 1 failure |
| Paint a photo over its own caption | lint |
| Record no history, so Back leaves the app | crash |
| Push an entry the history itself delivered | 4 failures |
| Stack a duplicate entry for the screen you are on | 4 failures |
| Push the opening entry instead of replacing it | 1 failure |
| Replace every entry, leaving nothing to go back to | crash |
| Trust the address bar without checking the screen name | 5 failures |
| Throw on a null hash instead of naming nothing | crash |
| Leave the screen on Back instead of closing the photo | 4 failures |
| Trust a popstate state naming an unknown screen | 1 failure |
| Land nowhere when an entry is unreadable | 2 failures |
| Ignore a deep link, or push it behind the opening entry | 1 failure |
| Take a history entry per fish the arrows walk to | 4 failures |
| Take no entry for the panel, so Back skips past it | 6 failures |
| Leave the panel's entry on the stack when it closes | 1 failure |
| Let a throwing pushState take the navigation down | crash |
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
| Delete `sw.js` while the page still registers it | lint: 1 finding |
| Typo an element id | lint: 2 findings |
| Delete `api/fish-i.js` | lint: 1 finding |
| Declare the same function twice | lint: 1 finding |

And on the FWP contest report, every count below measured rather than guessed:

| Break this | Expect |
|---|---|
| Read an unanswered residency as a resident | 2 failures |
| Count an unconfirmed entry on the form | 5 failures |
| Count a rejected catch as a fish caught | 9 failures |
| Let a death count exceed the fish caught | 3 failures |
| Let a disqualified angler hold the winning fish | 1 failure |
| Let a disqualified angler keep a standings place | 2 failures |
| Run the 30 days from the first day fished | 1 failure |
| Split the size tables at 8 inches instead of 12 | 10 failures |
| Let a fish longer than the table fall off the end | 2 failures |
| Round lengths up to the whole inch instead of down | 2 failures |
| Ignore a typed contest-hours override | 2 failures |
| Total a contest day from one end of it | 1 failure |
| Date a catch in the reader's time zone | 2 failures |
| Silence the report warnings | 6 failures |
| Print an unfilled box as a blank gap | 5 failures |
| Read the report of whichever event comes first | 1 failure |
| Leave markup in the plain-text copy | 1 failure |
| Stop the sheet being rendered at all | 9 failures |

And on the photo timestamp:

| Break this | Expect |
|---|---|
| Never draw the stamp onto the canvas | 3 failures |
| Draw the stamp before the image, so the photo covers it | 1 failure |
| Draw it once outside the encode loop | 3 failures |
| Write the stamp in the reader's time zone | 3 failures |
| Drop the time-zone label from the stamp | 1 failure |
| Stamp an uploaded file as an in-app capture | 2 failures |
| Present an upload's time as the time of capture | 1 failure |
| Stamp an unverified clock as if it had been checked | 1 failure |
| Add a "clock OK" line to every photo | 2 failures |
| Read the clock offset at render instead of freezing it at capture | 6 failures |
| Let an unreadable `Date` header reset the clock to a perfect match | 1 failure |
| Treat an unknown clock as a verified one | 1 failure |
| Read `res.headers.get()` unguarded | crashes every Supabase call |
| Swap "ahead" and "behind" | 6 failures |
| Report skew in seconds the header cannot support | 1 failure |
| Pass a catch from before stamping with no badge at all | 2 failures |
| Ignore a photo stamped after it was filed | crash |
| Ignore a long gap between capture and filing | crash |
| Drop the shrink-to-fit | 3 failures |
| Shrink the stamp when there is room | 3 failures |
| Remove the shrink's legibility floor | 1 failure |
| Nag the angler about a clock that is fine | 2 failures |
| Never tell the angler their clock is wrong | 1 failure |
| Stamp a photo taken off the event days as "Day 0" | 1 failure |

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

Six guards in the app are deliberately redundant, and a sabotage of any of
them passes: the phone-length check in `claimEntry` (the equality check already
refuses an empty number), the event-day check in `overdueCheckouts` (a
non-event day builds a `dayKey` that matches nothing), the `!anglerId` guard in
`canActFor` (an empty id is not in `myAnglerIds` either, so the lookup below
already returns false), the `paid === 0` early return in `splitFor` (the general path returns `[]` for an empty share list
anyway) and its `PAYOUT_SHARES.length` cap (the array holds three, so a literal
`4` slices to the same three), and the `seen` check in
`unpaidInTheMoney`'s division loop — `standingsFor` groups by angler, so one
person cannot appear twice in one division's top three. It is only reachable if
an angler's catches straddle two divisions, which needs a division edit after
they had already logged fish. The `seen` check in the same function's Big Fish
block *is* load-bearing (someone can place and lead the pot at once) and is
tested. All six behaviours are enforced twice. A test that went red for them would be asserting the
implementation rather than the rule, so there isn't one.

**A test cannot see a time zone it is already in.** The machine this was
written on is set to `America/Denver`, which is the tournament's own zone — so
"does the photo stamp use the event's zone or the reader's?" was unanswerable
locally, and deleting the `timeZone` option passed every test here while
failing three under `TZ=UTC`. The fix was not a note in this file: the suite now
creates an event in `Pacific/Honolulu` and asserts against that, so the check
bites on any machine. Watch for the same trap anywhere else the event zone and
the reader's could coincide.

**The registration form's own validation is not reachable from here.** Every
one of those checks — the emergency contact, the partner phone, the residency
question — lives inside the `reg-submit` click handler, and the stub DOM never
fires it. Sabotaging any of them passes. What is tested instead is the layer
underneath: `residencyCounts()` reads a null as *unanswered* and the report
warns about it, so an answer skipped at the form still cannot become a wrong
number on the state's paperwork. Pulling that validation out into a pure
function would close the gap properly, and has not been done.

The same is true of the **submit** handler, which is where the stamp gets
attached to the catch record and where a retake clears the previous shot's
stamp. `photoStamp()`, `encodeToBudget()` and `captureBadges()` are all covered;
the three lines of wiring between them are not.

That table exists because it has caught real gaps twice: replacing instead of
merging produced **no** failures until an assertion was added for it, and the
same was true of the `Authorization` header. A green run only means as much as
the last time somebody checked it could go red.
