import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { rowOf, rowsOf, TestDb, type Caller } from '../db/harness';
import { newPhone, registerSolo, setUpEvent } from '../db/fixtures';

/**
 * Chat and side bets, on a real Supabase (CI starts one): a post and a bet
 * from one phone reach another with no reload, and a bet's leader moves when
 * the director approves a fish.
 */
// Skipped on a PC with no Supabase. In CI one is always started, so there a
// missing server fails these rather than quietly skipping them.
const running = Boolean(process.env['SUPABASE_DB_URL'] && process.env['VITE_SUPABASE_URL']);
test.skip(!running && !process.env['CI'], 'Needs a Supabase to talk to; CI starts one');

// Every phone shows the one current event, so tests on the two phones take turns.
const TURN = 20261011;

let db: TestDb;
let director: Caller;
let eventId: string;

test.beforeEach(async () => {
  db = await TestDb.open();
  await db.admin(`select pg_advisory_lock($1)`, [TURN]);
  ({ director, eventId } = await setUpEvent(db));
});

test.afterEach(async () => {
  await db.admin(`select pg_advisory_unlock($1)`, [TURN]);
  await db.close();
});

async function live(page: Page) {
  await expect(page.getByRole('status')).toHaveText('Live', { timeout: 20_000 });
}

async function register(page: Page, name: string) {
  await page.goto('/register');
  await live(page);
  await page.getByLabel('Your name', { exact: true }).fill(name);
  await page.getByLabel('Phone', { exact: true }).fill(newPhone());
  await page.getByLabel('Emergency contact', { exact: true }).fill('Shore Contact');
  await page.getByLabel('Emergency contact phone', { exact: true }).fill(newPhone());
  await page.getByRole('radio', { name: 'Montana resident' }).check();
  await page.getByRole('button', { name: 'Complete registration' }).click();
  await expect(page.getByRole('heading', { name: 'You are registered' })).toBeVisible({
    timeout: 20_000,
  });
}

test('a post and a bet reach another phone, and the bet’s leader follows the fish', async ({
  page,
  browser,
  browserName,
}) => {
  await register(page, `Social ${browserName} ${String(Date.now())}`);

  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto('/chat');
  await live(second);

  // A post, read on the other phone with no reload.
  const words = `Fish on at the silos (${browserName})`;
  await page.goto('/chat');
  await page.getByLabel('Message').fill(words);
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Sending…')).toHaveCount(0, { timeout: 20_000 });
  await expect(second.getByText(words)).toBeVisible({ timeout: 20_000 });

  // A bet, started on this phone and seen on the other.
  const title = `Smallest walleye ${String(Date.now() % 100_000)}`;
  await page.goto('/side-bets');
  await page.getByLabel('What is the bet?').fill(title);
  await page.getByRole('button', { name: 'Start it' }).click();
  const bet = page.getByRole('listitem').filter({ hasText: title });
  await expect(bet).toContainText('1 angler in');
  await expect(bet).not.toContainText('Waiting to send.', { timeout: 20_000 });
  await second.goto('/side-bets');
  await expect(second.getByRole('listitem').filter({ hasText: title })).toBeVisible({
    timeout: 20_000,
  });

  // Somebody else joins and lands a small one; the director approves it.
  const [row] = await db.admin<{ id: string }>(`select id from public.bets where title = $1`, [
    title,
  ]);
  if (!row) throw new Error('The bet did not reach the database');
  const phone = await db.device('rival phone');
  const { summary, angler } = await registerSolo(db, phone, eventId);
  rowsOf(await db.call(phone, 'join_bet', { p_bet_id: row.id, p_angler_id: angler.id }));
  const catchId = randomUUID();
  rowOf(
    await db.call(phone, 'file_catch', {
      p_id: catchId,
      p_angler_id: angler.id,
      p_species: 'Walleye',
      p_length_inches: 14.25,
      p_logged_at: new Date().toISOString(),
    }),
  );
  rowOf(await db.call(director, 'director_review_catch', { p_id: catchId, p_status: 'approved' }));

  const handle = summary.anglers[0]?.handle ?? '';
  await expect(bet).toContainText('2 anglers in', { timeout: 20_000 });
  await expect(bet).toContainText(`Leading: ${handle} · 14.25″`, { timeout: 20_000 });
  await other.close();
});
