# Database

Paste a whole file into the Supabase SQL editor and press Run. Every one of
these is safe to run twice.

## If writes ever stop working mid-event

**`supabase-rollback-open-access.sql`** — one paste, and registration, catches,
check-ins and donations all work again. Safe in any state, and it leaves the
ownership columns alone so the security files can be re-applied afterwards.

This is the only one worth knowing about while standing at a boat ramp.

## Setting up a project from nothing

In this order. The Montana Kayak Walleye Open project has had all of them run
already — this is the list for a **new** Supabase project, which is what a
second organizer running their own tournament would need.

| # | File | What it does |
|---|---|---|
| 1 | `supabase-setup.sql` | The seven tables, open access, the photo bucket |
| 2 | `supabase-step2a-ownership-columns.sql` | Adds `owner` columns. Changes no behaviour |
| 3 | `supabase-step2b-enforce-policies.sql` | Turns ownership on. **Read the gate at the top first** |
| 4 | `supabase-one-entry-per-person.sql` | Unique name, phone and board code |
| 5 | `supabase-step3-shared-devices.sql` | Lets one angler use one entry from several devices |

Between 2 and 3 there is a manual step, described in 3: enable anonymous
sign-ins, open the app once so a device actually exists, and create the
director account with `{"director": true}` on its **app_metadata**. Running 3
before both of those exist locks everybody out, including you.

## Housekeeping

`reset-test-data.sql` empties every table in every event. The director portal
now does this per-event — Director → Event → **Clear data**, or **Delete** for
an event added there — which is almost always what you actually want. This file
is the blunt version for starting a project over completely.

## Why the applied files are still here

Running them once does not make them disposable: they are how a database gets
back to this shape, whether that is a second organizer's project or this one
after something goes wrong. They cost nothing to keep and cannot be
reconstructed from the app.
