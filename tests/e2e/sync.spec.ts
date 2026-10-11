import { expect, test, type Page } from '@playwright/test';
import { TestDb } from '../db/harness';
import { setUpEvent } from '../db/fixtures';

/**
 * The built app on a phone, against a real Supabase (CI starts one): it shows
 * the tournament the director set up, changes on screen the moment the
 * director changes it, and still shows it with no signal.
 */
// Skipped on a PC with no Supabase. In CI one is always started, so there a
// missing server fails these rather than quietly skipping them.
const running = Boolean(process.env['SUPABASE_DB_URL'] && process.env['VITE_SUPABASE_URL']);
test.skip(!running && !process.env['CI'], 'Needs a Supabase to talk to; CI starts one');

// Every phone shows the one current event, so tests on the two phones take
// turns: each holds this lock on the database from setup to finish.
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

async function rename(name: string) {
  await db.admin(`update public.events set name = $1 where id = $2`, [name, eventId]);
}

/** Whether the phone has saved its copy of this event, to open with no signal. */
function savedCopyOf(page: Page, id: string) {
  return page.evaluate(
    (wanted) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('livewire');
        open.onerror = () => {
          resolve(false);
        };
        open.onsuccess = () => {
          const request = open.result
            .transaction('snapshots')
            .objectStore('snapshots')
            .get('current');
          request.onsuccess = () => {
            const saved = request.result as { eventId?: string } | undefined;
            resolve(saved?.eventId === wanted);
          };
          request.onerror = () => {
            resolve(false);
          };
        };
      }),
    id,
  );
}

test('shows the tournament, and changes the moment the director changes it', async ({ page }) => {
  const name = `Open ${String(Date.now())}`;
  await rename(name);
  await page.goto('/');
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Live', { timeout: 20_000 });

  await rename(`${name}, renamed`);
  // No reload: the change arrives by itself.
  await expect(page.getByRole('heading', { name: `${name}, renamed` })).toBeVisible({
    timeout: 20_000,
  });
});

test('still shows the tournament with no signal', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright drives service workers in Chromium only');
  const name = `Offline ${String(Date.now())}`;
  await rename(name);
  await page.goto('/');
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => savedCopyOf(page, eventId), { timeout: 10_000 }).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('No signal');
  await context.setOffline(false);
});
