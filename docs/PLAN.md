# The LiveWire rebuild

Written October 2026, after reading every line of the current app (about
14,000 lines across the script, page, stylesheet, database files and tests)
and its full history.

## The short version

The current app's tournament rules are good and hard-won: tie on the earliest
fish, payouts that add up to the cent, board codes nobody can misread, a
course line that works with no signal. Those rules are being kept exactly. The
first stage already proves it: the new code and the old app are run side by
side on thousands of random tournaments and give identical answers.

What is being replaced is everything around the rules. The old app grew one
fix at a time inside a single 10,700-line file, and most of what went wrong
traces back to that, or to the database storing everything as loose blobs.

The old app lives on at
[Turmanat0r/Live-Wire](https://github.com/Turmanat0r/Live-Wire) and keeps
running the tournament until the switch-over. This repository is the rebuild.

## Two problems in the live app today

Found while reading for this plan. Both are in production now, separate from
the rebuild, and both can be fixed in the current app with a small database
change.

1. **A beacon is not seen by the field.** The beacon screen tells an angler in
   trouble that "the director and the whole field can see you". The database
   lets only the director and the angler read position rows, so other kayaks
   never see it. Only the director does.
2. **An angler can approve their own catch.** The catch's review status and
   length sit inside the same record the angler owns, and nothing on the
   server stops the owner changing them. The app never offers it, but anyone
   who reads the public source can do it through the database's web address.

## What went wrong, and what replaces it

| What happened                                                                 | Why                                                 | In the rebuild                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testing in a browser wrote real tournament data                               | Previews and local runs use the production database | A separate **staging** database. Previews and tests never touch production                                                                                                                                    |
| Database changes run by hand from a folder of SQL files                       | No migration tooling                                | Numbered migrations applied by the Supabase CLI, and tested in CI against a throwaway database                                                                                                                |
| Every table is an id plus a JSON blob                                         | Quick to start                                      | Real columns, foreign keys and constraints. TypeScript types generated from the schema, so code and database cannot disagree                                                                                  |
| The two live problems above, plus names and phone numbers readable by anyone  | Security had to be bolted onto blobs                | Contact details in a table only the director and the angler can read. Review fields writable only through a director function. Beacons in their own table readable by every entrant. Every rule tested        |
| A director passcode shipped to every phone                                    | No server-side role at first                        | No passcode. The director is a signed-in account; the database checks the role                                                                                                                                |
| Every phone downloads every table every 5 seconds                             | Polling was simpler than live updates               | Live updates: the server names each changed row and the phone reads just that row. The whole event is read again only after the connection drops. Large saving in battery and data on one bar of signal       |
| Offline outbox and photos in localStorage (about 5 MB, text only)             | Easiest storage available                           | IndexedDB, which holds real photo files. Everything waits on the phone until the server has it, and is sent in order when signal returns. Photos are small enough that one cut off mid-send simply goes again |
| One 10,700-line file in one global scope                                      | It started small                                    | Separate modules by feature. Rules in a pure layer (`src/domain`) with no screen code, testable alone                                                                                                         |
| A 1,400-line hand-written linter that reads code by its wording               | Nothing standard fitted the single-file design      | ESLint, Stylelint and Prettier, the industry standard. Each guard rule was planted with a fault and confirmed to fire                                                                                         |
| Type checks switched on one at a time over 12 pull requests                   | Converting existing code                            | Every check on from the first line                                                                                                                                                                            |
| Screens built from strings of HTML, escaped by hand                           | No framework                                        | React, which renders text safely by default. A lint rule forbids raw HTML                                                                                                                                     |
| Forms that a background refresh could wipe mid-typing                         | Whole-screen repaints                               | Components that update only what changed                                                                                                                                                                      |
| 218 inline styles became 71 `!important`s; text as small as 8px               | Styles fought each other                            | Design tokens and cascade layers. No `!important` anywhere. Nothing under 13px, enforced by lint                                                                                                              |
| `#hash` screens, links with no address                                        | Single static file                                  | Real addresses (`/standings`) that can be shared and refreshed. Semantic landmarks. Focus moves to each page's heading. Accessibility checked by axe in CI                                                    |
| A hand-kept list of offline files; old and new files could mix after a deploy | No build step for assets                            | Build-generated, content-hashed files cached as one set. A phone has all of the new version or all of the old                                                                                                 |
| Fees, fishing hours and events written into the code                          | Set once and edited by hand                         | Event settings in the database, edited from the director's screens                                                                                                                                            |
| Each phone scores the tournament on its own                                   | Client-only app                                     | The same rules module runs on phones (live board, offline) and on the server (the official frozen result)                                                                                                     |
| Photo tamper check compared hashes the owner could also edit                  | Integrity checked on the device                     | Photos cannot be replaced once filed (storage policy). The server records the fingerprint                                                                                                                     |
| Fish-I finds its AI model by listing and ranking what Google offers           | Free tier, model names change                       | One model, named in configuration                                                                                                                                                                             |
| 840 KB of fonts                                                               | The same file shipped three times under three names | 150 KB: one file per face, the four faces the old app used                                                                                                                                                    |
| Only Chrome ever checked                                                      | No cross-browser testing                            | Every change tested on emulated Android (Chromium) and iPhone (WebKit). A short manual checklist for a real iPhone                                                                                            |
| A 700-line README written as a diary                                          | Every fix explained in place                        | A short README for running it. This plan for direction. Comments only where the code cannot speak for itself                                                                                                  |

## Fishing-day realities that shape the design

- **One bar at the ramp, none on the water.** Every write goes to the phone
  first and syncs later. Reading the board works on the last sync. Map tiles
  already seen are kept for the day.
- **iPhones suspend a web app in the background.** A beacon can only refresh
  while the screen is on. The beacon screen will say so honestly, and will offer a
  one-tap text message to the director with your coordinates filled in. A text
  often gets out where data will not.
- **Wet hands, gloves and glare.** Tap targets of at least 48px, contrast
  checked on every screen's colours, and a large shutter button.
- **Batteries last one day.** No polling. GPS only when asked, and on a timer only
  while a beacon is up.

## The stack

| Piece    | Choice                                                                                              | Why                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Language | TypeScript 6, every strict check on                                                                 | Industry standard. Version 7 is faster, but the standard linter does not support it yet |
| Screens  | React 19 with React Router                                                                          | The most widely used option, so the easiest to hire or get help for                     |
| Build    | Vite 8                                                                                              | The standard for apps like this                                                         |
| Offline  | vite-plugin-pwa (Workbox)                                                                           | Generates the offline cache from the build                                              |
| Styles   | Plain CSS files beside each component, cascade layers, design tokens                                | Readable class names in the HTML. No CSS-in-JS. Works under the strict security policy  |
| Data     | Supabase (Postgres, Auth, Storage, Realtime)                                                        | Already in use; the rebuild uses it properly                                            |
| Tests    | Vitest + fast-check (rules), Testing Library (screens), Playwright + axe (phones and accessibility) | Standard, and they run in CI                                                            |
| Hosting  | Vercel                                                                                              | Already in use                                                                          |

## Stages

One pull request each, in order. Every stage ends green in CI and deployed to
a preview on staging.

| #   | Stage                           | Delivers                                                                                                                   |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Foundation** (done)           | Tooling, CI, design tokens, app shell with every screen's address, the rules layer proven identical to the old app         |
| 2   | **Database** (done)             | Schema, row rules, server functions, policy tests, the staging project, generated types                                    |
| 3   | **Sync and offline** (done)     | Sign-in per device, live updates, the outbox, resumable photo upload, database types generated offline                     |
| 4   | **Anglers on the water** (done) | Register, bring an entry onto a phone, check in and out; submit a catch with camera and photo checks, my catches, livewell |
| 5   | **Safety** (done)               | Where am I against the line, the course map, beacons the whole field sees on every screen, text-the-director               |
| 6   | **The board** (done)            | Standings, Big Fish, payouts; side bets and chat                                                                           |
| 7   | Director's tools                | Review and Fish-I, contestants, fees, event and course setup, overdue alerts, freezing results, the FWP report             |
| 8   | Memories                        | Gallery, trophy case, highlight reel                                                                                       |
| 9   | Field test and switch-over      | A practice day on real phones, then production moves to the new app                                                        |

The switch-over should land well before registration opens for 2027, and away
from any event.

Overdue alerts moved from stage 5 to stage 7: only the director sees them,
and the director signs in from stage 7. The rules behind them are already in
`src/domain/safety.ts`.

## What only a phone can tell you

Repeat on a real iPhone (Safari) and a real Android phone (Chrome) before the
switch-over, and after any change to the offline setup:

1. Open the app with signal and add it to the home screen.
2. Force-quit it, turn on airplane mode, and open it from the home screen.
   Every screen should open, in LiveWire's own fonts.
3. File a catch in airplane mode, turn signal back on, and watch it arrive on
   the director's screen.
4. Raise a beacon on one phone and see it on the other.

## Decisions for Daniel

- **Repository.** Decided: a new repository, this one. The old one was renamed
  Live-Wire.
- **Hosting.** Decided: a Vercel project for this repository, at
  livewire-turmanator.vercel.app, with the staging address and publishable
  key as its two settings. It is the testing site until switch-over.
- **The final address.** Decided: the one anglers already have,
  live-wire-three.vercel.app. At switch-over that address moves to the new
  app (stage 9), with no "rebuild" anywhere in it. Keeping it matters beyond
  the name: an installed app and everything it saved belong to its address,
  so a new one would mean every angler reinstalling and bringing their entry
  back onto their phone.
- **The look.** Decided: the old app's, screen for screen: the dark home with
  its red, the tinted screens, the floating tab bar, and its four faces. As
  in the old app, dark mode on a phone changes nothing. Two departures, both
  for reading on the water: no text under 13px (the old labels went to 8px),
  and a few colours a shade off where the old pair was too faint to pass the
  contrast standard.
- **Sign-in limit.** Each phone signs itself in once, anonymously. Supabase
  allows 30 such sign-ins an hour from one internet address, and a boat ramp's
  phones can share one through their carrier. Raise it (Authentication, Rate
  Limits) on staging before a practice day and on production before an event.
- **Staging database.** Decided: `livewire-staging`, a free project in the
  Vercel-managed Supabase area (_turmanat0r's projects_), where my tools can
  reach it and cannot reach the live database. The old LiveWire project was
  paused to free the slot. GitHub applies database changes to it after each
  merge.
- **Fish-I provider.** Stay on Google's free tier, or pay for a stronger model.
  It is a cost decision; the code will take either.
- **Fonts.** Decided: all four of the old app's. Inter to read, Oswald for
  headings, Fraunces for card titles, Space Mono for the small labels.
- **The two live problems.** Decided: fixed in the current app (Live-Wire
  pull request 19).
