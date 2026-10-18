# Switch-over

How the new app takes over from the old one at live-wire-three.vercel.app,
the address anglers already have installed. Stage 9 of [PLAN.md](PLAN.md).

Decided (October 2026):

- **Production starts empty.** The old database only ever held testing; the
  first real tournament is September 2027. Nothing is imported.
- **Production is the old LiveWire project, rebuilt.** It stays in Daniel's own
  Supabase organisation, where Claude's tools cannot reach it. Daniel does every
  production step himself.
- **A weekly keep-alive** stops the free project going to sleep between
  tournaments (`api/keep-alive.ts`, scheduled in `vercel.json`). Vercel runs it,
  not GitHub: GitHub switches schedules off in a public repository after 60
  days with no commits, which is exactly the quiet months.

## How production stays in step

The live site's Vercel project builds a branch called `production`, not
`main`. After a merge, CI checks everything, applies database changes to
staging, then to production, and only then moves `production` to the merged
commit. So the live app never calls a database function that is not there
yet. Until the `PRODUCTION_DB_URL` secret exists, that last job does nothing.

The testing site (livewire-turmanator.vercel.app) still builds `main` against
staging, as it does now.

## 1. Practice day, on staging

On real phones, at least one iPhone (Safari) and one Android phone (Chrome),
against the testing site:

1. **Raise the sign-in limit on staging.** Supabase, livewire-staging,
   Authentication, Rate Limits: anonymous sign-ins per hour from 30 to 300.
   Phones at one boat ramp can share an internet address.
2. **Make the practice day a fishing day.** In the app: Director, Event, Edit
   the live event, add the practice date to its fishing days.
3. Work through **What only a phone can tell you** in PLAN.md (install to the
   home screen, airplane mode, offline catch, beacon on two phones).
4. Then the rest of a tournament:
   - register solo and as a team; bring an entry onto a second phone with
     "Already registered?";
   - check in, file a catch with the in-app camera and one from the camera
     roll, check out;
   - director: review, approve and reject; Contestants (fee paid,
     disqualify); Positions;
   - standings, Big Fish, side bets, chat, payouts;
   - freeze the results; trophy case; fish gallery; **make a highlight reel on
     the iPhone** (no automated test can, so this is its first real run);
   - print the FWP report.
5. Write down anything odd, with the phone and the time.

## 2. Switch-over day

Pick a quiet day: no event, and not the first days of registration. Allow an
hour. Steps A to C are in this order for a reason.

### A. The production database (Supabase, Daniel's organisation)

1. Open the **LiveWire** project and **Restore** (unpause) it. Wait until it
   says it is healthy.
2. **Storage**, bucket `catch-photos`: select every file and delete them. They
   are test photos, and the database will not delete them itself.
3. **SQL Editor**, new query: paste all of
   [switch-over/reset-old-app.sql](switch-over/reset-old-app.sql) and Run. The
   result should list only your director account. If it says the project
   already has the new app's database, it has been done before; stop and ask.
4. **Authentication, Sign In / Providers**: anonymous sign-ins **on**.
   **Rate Limits**: anonymous sign-ins 300 an hour, as on staging.
5. **Connect**, Session pooler: copy the connection string and put the
   database password into it. It goes straight into GitHub in step 7, nowhere
   else.

### B. Vercel (project live-wire)

6. **Settings, Git**: disconnect `Turmanat0r/Live-Wire` and connect
   `Turmanat0r/LiveWire`.
7. **Settings, Environments, Production**: branch tracking `production`.
8. **Settings, Build and Deployment, Ignored Build Step**, custom command:
   `[ "$VERCEL_GIT_COMMIT_REF" != "production" ]`
   so only the `production` branch is ever built here. No branch preview can
   reach the production database.
9. **Settings, Environment Variables**, Production only:
   `VITE_SUPABASE_URL` = the production project's URL, and
   `VITE_SUPABASE_PUBLISHABLE_KEY` = its publishable key (Project Settings, API
   Keys). Leave `GEMINI_API_KEY` where it is; Fish-I uses it later.

### C. GitHub

10. **Settings, Secrets and variables, Actions**: new repository secret
    `PRODUCTION_DB_URL`, the string from step 5.
11. **Actions, CI, Run workflow** on `main`. When **Apply database changes to
    production, then publish** is green, the database is built and the
    `production` branch exists; Vercel starts building the live site from it.

### D. Check it

12. Open live-wire-three.vercel.app on a phone that has the old app installed.
    It shows **A newer version of LiveWire is ready**; tap **Update now**. (The
    old app's own Update banner works too.)
13. Director: sign in with your existing director email and password.
14. Director, Event: add the 2027 event (details, species, course, safety
    number) and **Make live**.
15. Register a test entry on a phone, then remove it under Contestants.

## Going back

The old app cannot come back once step 3 has run: its tables are gone. That is
why the practice day comes first. A new-app release that turns out badly is
undone in Vercel: Deployments, the previous good one, **Instant Rollback**.
So far every database change has only added things, so an older app keeps
working against a newer database. Keep it that way.
