import { expect, test, type Page } from '@playwright/test';
import { TestDb } from '../db/harness';
import { newPhone, setUpEvent } from '../db/fixtures';

/**
 * An angler's first morning, on a real Supabase (CI starts one): register on
 * one phone, write down the Tournament ID, check in, then bring the entry onto
 * a second phone with that ID and the phone number.
 */
// Skipped on a PC with no Supabase. In CI one is always started, so there a
// missing server fails these rather than quietly skipping them.
const running = Boolean(process.env['SUPABASE_DB_URL'] && process.env['VITE_SUPABASE_URL']);
test.skip(!running && !process.env['CI'], 'Needs a Supabase to talk to; CI starts one');

// Every phone shows the one current event, so tests on the two phones take
// turns: each holds this lock on the database from setup to finish.
const TURN = 20261011;

let db: TestDb;

test.beforeEach(async () => {
  db = await TestDb.open();
  await db.admin(`select pg_advisory_lock($1)`, [TURN]);
  await setUpEvent(db);
});

test.afterEach(async () => {
  await db.admin(`select pg_advisory_unlock($1)`, [TURN]);
  await db.close();
});

async function live(page: Page) {
  await expect(page.getByRole('status')).toHaveText('Live', { timeout: 20_000 });
}

test('registers, checks in, and brings the entry onto a second phone', async ({
  page,
  browser,
  browserName,
}) => {
  const name = `Angler ${browserName} ${String(Date.now())}`;
  const phone = newPhone();

  await page.goto('/register');
  await live(page);
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByLabel('Phone', { exact: true }).fill(phone);
  await page.getByLabel('Emergency contact', { exact: true }).fill('Shore Contact');
  await page.getByLabel('Emergency contact phone', { exact: true }).fill(newPhone());
  await page.getByRole('radio', { name: 'Montana resident' }).check();
  await page.getByRole('button', { name: 'Complete registration' }).click();

  await expect(page.getByRole('heading', { name: 'You are registered' })).toBeVisible({
    timeout: 20_000,
  });
  const code = (await page.locator('.codechip__code').first().textContent()) ?? '';
  expect(code).toMatch(/^[34679ACDEFHJKMNPQRTWXY]{4}$/);

  // The home card says who this phone is.
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText(`Tournament ID ${code}`)).toBeVisible();

  // Check in on day one; the server's record replaces the phone's own.
  await page.goto('/check-in');
  const days = page.getByRole('list', { name: 'Fishing days' }).getByRole('listitem');
  await days.first().getByRole('button', { name: 'Check in' }).click();
  await expect(days.first()).toContainText(/Checked in at \d+:\d\d [AP]M/);
  await expect(days.first()).not.toContainText('waiting to send', { timeout: 20_000 });
  await expect(days.first().getByRole('button', { name: 'Check out' })).toBeVisible();

  // A second phone: same entry, brought over with the code and the number.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto('/register');
  await live(second);
  await second.getByRole('button', { name: 'Sign in to my entry' }).click();
  await second.getByLabel('Tournament ID', { exact: true }).fill(code.toLowerCase());
  await second.getByLabel('Phone you registered with', { exact: true }).fill(phone);
  await second.getByRole('button', { name: 'Bring my entry over' }).click();
  await expect(second.getByRole('heading', { name: 'You are registered' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(second.getByText(name)).toBeVisible();
  await other.close();
});
