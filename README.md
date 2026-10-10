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
npm run check     # types, lint, formatting, unit tests
npm run build     # production build into dist/
npm run test:e2e  # emulated Android and iPhone; first run: npx playwright install chromium webkit
```

`npm run test:parity` runs the rules against the old app and needs its build:
clone [Turmanat0r/Live-Wire](https://github.com/Turmanat0r/Live-Wire) beside
this folder and run `npm ci && npm run build` in it, or point
`LEGACY_APP_JS` at its `app/livewire.js`.

## Where things are

|                 |                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`   | The tournament rules: scoring, ties, payouts, the course line, the clock, handles, photo fingerprints. Pure functions, no screen code |
| `src/app/`      | The shell: routes, tab bar, the list of screens, the update prompt                                                                    |
| `src/screens/`  | One component per screen                                                                                                              |
| `src/ui/`       | Shared building blocks: page, card, icons                                                                                             |
| `src/styles/`   | Tokens (the only file allowed to name a colour), cascade layers, base styles                                                          |
| `tests/parity/` | The old app run as an oracle against the new rules. Deleted at switch-over                                                            |
| `tests/e2e/`    | Browser tests on emulated phones, including offline and accessibility                                                                 |
| `vercel.json`   | Hosting: security headers, caching, every address served by the app                                                                   |

## Rules the code holds itself to

- Every TypeScript strict check is on. No `any`, no `!`.
- Text from the database is rendered as text; raw HTML is a lint error.
- No inline styles (the Content-Security-Policy blocks them) and no
  `!important`. Colours come from `tokens.css` only.
- Nothing smaller than 13px. Tap targets at least 48px.
- Every ranking breaks a tie on the earliest fish, then the id.
- Money is whole cents.
