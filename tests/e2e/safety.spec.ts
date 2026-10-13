import { expect, test, type Page } from '@playwright/test';
import { rowOf, TestDb, type Caller } from '../db/harness';
import { newPhone, setUpEvent } from '../db/fixtures';

/**
 * A beacon, on a real Supabase (CI starts one): one phone checks it is inside
 * the course and raises a beacon; a second phone, anywhere in the app, hears
 * about it with no reload, and hears again when it is stood down.
 */
// Skipped on a PC with no Supabase. In CI one is always started, so there a
// missing server fails these rather than quietly skipping them.
const running = Boolean(process.env['SUPABASE_DB_URL'] && process.env['VITE_SUPABASE_URL']);
test.skip(!running && !process.env['CI'], 'Needs a Supabase to talk to; CI starts one');

// Every phone shows the one current event, so tests on the two phones take turns.
const TURN = 20261011;
// Inside the fixtures' course: a 4-mile circle at Canyon Ferry.
const ON_THE_WATER = { latitude: 46.39, longitude: -111.57 };

test.use({ permissions: ['geolocation'], geolocation: ON_THE_WATER });

let db: TestDb;
let director: Caller;
let eventId: string;

test.beforeEach(async () => {
  db = await TestDb.open();
  await db.admin(`select pg_advisory_lock($1)`, [TURN]);
  ({ director, eventId } = await setUpEvent(db));
  rowOf(
    await db.call(director, 'director_set_safety_contact', {
      p_event_id: eventId,
      p_phone: '406-555-0142',
    }),
  );
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

test('a beacon reaches another phone by itself, and so does standing it down', async ({
  page,
  browser,
  browserName,
}) => {
  const name = `Beacon ${browserName} ${String(Date.now())}`;
  await register(page, name);
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto('/safety');
  await page.getByRole('button', { name: 'Check my position' }).click();
  await expect(page.getByText('In bounds', { exact: true })).toBeVisible();
  const text = page.getByRole('link', { name: 'Text the director' });
  await expect(text).toHaveAttribute('href', /^sms:\+14065550142\?&body=LiveWire%3A%20Beacon/);

  // A second phone in the field, on another screen entirely.
  const other = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 46.4, longitude: -111.57 },
  });
  const second = await other.newPage();
  await second.goto('/standings');
  await live(second);
  await expect(second.getByRole('alert')).toHaveCount(0);

  await page.getByLabel('What is wrong? (optional)').fill('Cold, need a tow');
  await page.getByRole('button', { name: 'Raise a beacon' }).click();
  await expect(page.getByText('Your beacon is up')).toBeVisible({ timeout: 20_000 });

  const banner = second.getByRole('alert');
  await expect(banner).toContainText('Beacon raised', { timeout: 20_000 });
  await expect(banner).toContainText('needs help');
  await second.getByRole('link', { name: /Beacon raised/ }).click();
  await expect(second.getByText('“Cold, need a tow”')).toBeVisible();

  await page.getByRole('button', { name: 'Stand down: I am OK' }).click();
  await expect(page.getByRole('button', { name: 'Raise a beacon' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(second.getByText('“Cold, need a tow”')).toHaveCount(0, { timeout: 20_000 });

  const [kept] = await db.admin<{ stood_down: boolean }>(
    `select b.stood_down_at is not null as stood_down
       from public.beacons b join public.angler_private p on p.angler_id = b.angler_id
      where p.full_name = $1`,
    [name],
  );
  expect(kept?.stood_down).toBe(true);
  await other.close();
});
