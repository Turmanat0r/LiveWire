# LiveWire

Catch, photo and release scoring for kayak fishing tournaments: anglers file a
fish from the water with a photo, the field watches the board, and the director
runs check-in, review, payouts and the state report. A web app that installs to
a phone's home screen and works with no signal.

This is the rebuild. Where it is heading, and why, is in
[docs/PLAN.md](docs/PLAN.md).

## Running it

Needs Node 22 or newer.

```sh
npm ci            # once
npm run dev       # the app at http://localhost:5173
npm run check     # types, lint, formatting, unit and database tests
npm run build     # production build into dist/
npm run test:e2e  # emulated Android and iPhone; first run: npx playwright install chromium webkit
npm run db:types  # after changing a migration: regenerate the database types
```

A build talks to the Supabase project named by two settings, both public by
design (see [`.env.example`](.env.example)): `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Without them the app runs with no server and
says so at the top of each screen; on Vercel the build refuses to run without
them. The browser tests that need a server (`tests/e2e/sync.spec.ts`,
`tests/remote/`) run on GitHub, which starts a Supabase for them.

`npm run test:parity` runs the rules against the old app and needs its build:
clone [Turmanat0r/Live-Wire](https://github.com/Turmanat0r/Live-Wire) beside
this folder and run `npm ci && npm run build` in it, or point
`LEGACY_APP_JS` at its `app/livewire.js`.

## Database

The database is defined entirely by the numbered files in
[`supabase/migrations`](supabase/migrations), applied in order. Nobody changes
it by hand: a change is a new numbered file, in a pull request, like any other
code. A file that has been applied is never edited; a fix is another file.

How it is built, in short: every table can be read through row-level security
and written by nobody. Every change goes through a named function
(`register_entry`, `file_catch`, `director_review_catch` ...) that checks who is
asking. What only an angler and the director may see - names, phones, board
codes, fees, where a fish was caught - lives in separate `*_private` /
`catch_evidence` tables. The comments at the top of each file explain its part.

**Tested** by `npm run test:db`, which builds a fresh Postgres in memory, applies
every migration, and acts out the rules as anglers, teammates, strangers and
the director. On GitHub the same tests also run against a real Supabase.

**Deployed** by GitHub. After a merge to `main`, once every check has passed,
the last job applies any new migrations to the staging database,
`livewire-staging`. It needs one repository secret:

- `STAGING_DB_URL`: the staging database's **session pooler** connection
  string, with the database password in place of `[YOUR-PASSWORD]`. In
  Supabase: open the project, **Connect**, **Connection string**, method
  **Session pooler**. It reaches that one database and nothing else in the
  account. If the password is ever reset, update the secret.

**Types.** `src/data/database.types.ts` is generated, never written by hand:
`npm run db:types` builds the database from the migrations (on the stand-in,
so on any PC) and runs Supabase's own type generator over it.
`tests/db/types.test.ts` regenerates it and fails if the committed file
differs; on GitHub it does the same against a real Supabase.

**Live updates.** Every table has a trigger that sends a signal naming the
changed row (its table and key, never its contents) on the event's topic.
Phones listen, read just that row again under their own rules, and drop it if
it comes back empty: that is how an overturned catch leaves every board.

## Where things are

|                 |                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`   | The tournament rules: scoring, ties, payouts, the course line, the clock, handles, photo fingerprints. Pure functions, no screen code                          |
| `src/data/`     | The phone's copy of the tournament, the outbox, and the one file that talks to Supabase (`supabase.ts`). Starts at `sync.ts`                                   |
| `src/app/`      | The shell: routes, tab bar, the list of screens, the update prompt, the beacon banner and its minute-by-minute position                                        |
| `src/screens/`  | One component per screen                                                                                                                                       |
| `src/ui/`       | Shared building blocks: page, card, icons                                                                                                                      |
| `src/styles/`   | Tokens (the only file allowed to name a colour), cascade layers, base styles                                                                                   |
| `tests/parity/` | The old app run as an oracle against the new rules. Deleted at switch-over                                                                                     |
| `tests/e2e/`    | Browser tests on emulated phones, including offline and accessibility                                                                                          |
| `supabase/`     | The database: config, and every migration in order. See Database, above                                                                                        |
| `tests/db/`     | The database rules acted out, on a stand-in locally and on real Supabase in CI                                                                                 |
| `tests/remote/` | The app's Supabase adapter against a real Supabase: sign-in, refusals, photos, live signals. CI only                                                           |
| `vercel.json`   | Hosting: security headers, caching, every address served by the app. The course map's tiles come from OpenStreetMap, the only outside address besides Supabase |

## Rules the code holds itself to

- Every TypeScript strict check is on. No `any`, no `!`.
- Text from the database is rendered as text; raw HTML is a lint error.
- No inline styles (the Content-Security-Policy blocks them) and no
  `!important`. Colours come from `tokens.css` only.
- Nothing smaller than 13px. Tap targets at least 48px.
- Every ranking breaks a tie on the earliest fish, then the id.
- Money is whole cents.
