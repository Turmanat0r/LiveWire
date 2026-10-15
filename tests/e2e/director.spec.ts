import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { rowOf, TestDb } from '../db/harness';
import { registerSolo, setUpEvent } from '../db/fixtures';

/**
 * The director, on a real Supabase (CI starts one): sign in with the
 * director's account, see another angler's fish under their real name with
 * its evidence, approve it, and sign out to an ordinary phone.
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
  const { angler } = await registerSolo(db, phone, eventId);
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

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 20_000 });
});
