import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { rowOf, rowsOf, TestDb, type Caller } from '../db/harness';
import { registerSolo, setUpEvent } from '../db/fixtures';

/**
 * The board, on a real Supabase (CI starts one), seen from a phone in the
 * crowd: an approved fish reaches the standings by itself, and the payout
 * screen counts a paid entry without the phone ever learning who paid.
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

test('an approved fish reaches the standings, and a paid entry the payouts', async ({ page }) => {
  await page.goto('/standings');
  await live(page);
  await expect(page.getByText('No approved catches yet in this division.')).toBeVisible();

  // Somebody else's phone registers and files a fish; the director approves it.
  const phone = await db.device('angler phone');
  const { summary, angler } = await registerSolo(db, phone, eventId);
  const handle = summary.anglers[0]?.handle ?? '';
  const catchId = randomUUID();
  rowOf(
    await db.call(phone, 'file_catch', {
      p_id: catchId,
      p_angler_id: angler.id,
      p_species: 'Walleye',
      p_length_inches: 23.5,
      p_logged_at: new Date().toISOString(),
    }),
  );
  rowOf(await db.call(director, 'director_review_catch', { p_id: catchId, p_status: 'approved' }));

  const board = page.getByRole('list', { name: 'Solo standings' });
  await expect(board.getByRole('listitem')).toHaveText(
    [`1${handle}Best 3 combined: 23.50″23.50″`],
    {
      timeout: 20_000,
    },
  );

  // The director matches the entry fee; the crowd only ever sees the count.
  rowsOf(
    await db.call(director, 'director_set_fee_paid', {
      p_entry_id: summary.entryId,
      p_paid: true,
    }),
  );
  await page.goto('/payouts');
  const solo = page.getByRole('region', { name: 'Solo division' });
  await expect(solo).toContainText('Solo division · 1 entry · $30.00 pool', { timeout: 20_000 });
  await expect(solo.getByRole('listitem')).toHaveText(['1st$15.00']);
  await expect(solo).toContainText('$15.00 of this pool is unawarded');
});
