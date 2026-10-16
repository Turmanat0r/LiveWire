import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { rowOf, TestDb } from '../db/harness';
import { registerSolo, setUpEvent } from '../db/fixtures';

/**
 * The director, on a real Supabase (CI starts one): sign in with the
 * director's account, see another angler's fish under their real name with
 * its evidence, approve it, find that angler's Tournament ID by their phone,
 * match their fee and check them in, log a donation and the awards budget,
 * and sign out to an ordinary phone.
 */
// Skipped on a PC with no Supabase. In CI one is always started, so there a
// missing server fails these rather than quietly skipping them.
const url = process.env['VITE_SUPABASE_URL'];
const secret = process.env['SUPABASE_SECRET_KEY'];
const running = Boolean(process.env['SUPABASE_DB_URL'] && url && secret);
test.skip(!running && !process.env['CI'], 'Needs a Supabase to talk to; CI starts one');

// Every phone shows the one current event, so tests on the two phones take turns.
const TURN = 20261011;

let db: TestDb;
let eventId: string;

test.beforeEach(async () => {
  db = await TestDb.open();
  await db.admin(`select pg_advisory_lock($1)`, [TURN]);
  ({ eventId } = await setUpEvent(db));
});

test.afterEach(async () => {
  await db.admin(`select pg_advisory_unlock($1)`, [TURN]);
  await db.close();
});

/** A director's account, made the way the director's is: by whoever runs the server. */
async function directorAccount(): Promise<{ email: string; password: string }> {
  if (!url || !secret) throw new Error('No Supabase to make the account on');
  const email = `director-${randomUUID()}@example.com`;
  const password = randomUUID();
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { director: true },
  });
  if (error) throw error;
  return { email, password };
}

async function live(page: Page) {
  await expect(page.getByRole('status')).toHaveText('Live', { timeout: 20_000 });
}

test('the director signs in, approves a fish, and signs out', async ({ page }) => {
  const { email, password } = await directorAccount();

  // Somebody's phone files a fish.
  const phone = await db.device('angler phone');
  const { angler, summary } = await registerSolo(db, phone, eventId);
  const catchId = randomUUID();
  rowOf(
    await db.call(phone, 'file_catch', {
      p_id: catchId,
      p_angler_id: angler.id,
      p_species: 'Walleye',
      p_length_inches: 24.75,
      p_logged_at: new Date().toISOString(),
      p_photo_source: 'camera',
      p_lat: 46.39,
      p_lng: -111.57,
      p_boundary: { kind: 'circle', within: true, fromLaunchMiles: 0.5, outsideMiles: 0 },
    }),
  );

  await page.goto('/director');
  await live(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Signed in as the tournament director (${email})`)).toBeVisible({
    timeout: 20_000,
  });

  // Their real name: the director's copy holds what only the director may read.
  const pending = page.getByRole('list', { name: 'Pending catches' });
  const card = pending.getByRole('listitem').filter({ hasText: angler.fullName });
  await expect(card).toContainText('24.75″', { timeout: 20_000 });
  await expect(card).toContainText('In bounds · 0.5 mi from launch');
  await card.getByRole('button', { name: 'Approve' }).click();

  await expect
    .poll(
      async () =>
        (
          await db.admin<{ status: string }>(`select status from public.catches where id = $1`, [
            catchId,
          ])
        )[0]?.status,
      { timeout: 20_000 },
    )
    .toBe('approved');
  await expect(card).toHaveCount(0);

  // An angler who lost their Tournament ID: found by phone, and read to them.
  await page.getByRole('button', { name: /Contestants/ }).click();
  await page.getByLabel('Find an angler').fill(angler.phone);
  const found = page.getByRole('list', { name: 'Anglers' }).getByRole('listitem');
  await expect(found).toHaveCount(1);
  await expect(found).toContainText(`Tournament ID ${summary.anglers[0]?.anglerCode ?? '?'}`);

  // Their fee arrives, and they check in at the ramp with a flat phone.
  await found.getByRole('button', { expanded: false }).click();
  await found.getByRole('button', { name: 'Fee received' }).click();
  await found.getByRole('button', { name: 'Check in now' }).first().click();
  await expect
    .poll(
      async () =>
        (
          await db.admin<{ paid: boolean; checked_in: boolean }>(
            `select ep.fee_paid as paid,
                    exists (select 1 from public.check_ins c
                             where c.angler_id = $2 and c.in_at is not null) as checked_in
               from public.entry_private ep where ep.entry_id = $1`,
            [summary.entryId, angler.id],
          )
        )[0],
      { timeout: 20_000 },
    )
    .toEqual({ paid: true, checked_in: true });

  // A sponsor's donation and the trophy budget, in the payout calculator.
  await page.getByRole('button', { name: /Payout calculator/ }).click();
  await page.getByLabel('Add to').selectOption({ label: 'Big Fish pot' });
  await page.getByLabel('Amount ($)').fill('40');
  await page.getByLabel('From / note (optional)').fill('Bait shop');
  await page.getByRole('button', { name: 'Add donation' }).click();
  await page.getByLabel('Awards budget ($)').fill('125.50');
  await page.getByRole('button', { name: 'Save budget' }).click();
  await expect
    .poll(
      async () =>
        (
          await db.admin<{ donated: string | null; budget: number }>(
            `select (select string_agg(target || ' ' || amount_cents || ' ' || note, ', ')
                       from public.donations where event_id = $1) as donated,
                    awards_budget_cents as budget
               from public.events where id = $1`,
            [eventId],
          )
        )[0],
      { timeout: 20_000 },
    )
    .toEqual({ donated: 'big_fish 4000 Bait shop', budget: 12_550 });
  await expect(page.getByRole('list', { name: 'Donations' })).not.toContainText(
    'Waiting to send.',
    { timeout: 20_000 },
  );

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 20_000 });
});
