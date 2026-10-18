import { expect, test, type Page } from '@playwright/test';
import { TestDb, type Caller } from '../db/harness';
import { newPhone, setUpEvent } from '../db/fixtures';

/**
 * Filing a fish, on a real Supabase (CI starts one): register, photograph a
 * catch (the in-app camera on Android, the camera roll on the iPhone), see it
 * on My catches, and watch the director's approval arrive by itself, with the
 * fish counting in the livewell and on the gallery wall, saved from there and
 * made into a highlight reel, and in the trophy case.
 */
// Skipped on a PC with no Supabase. In CI one is always started, so there a
// missing server fails these rather than quietly skipping them.
const running = Boolean(process.env['SUPABASE_DB_URL'] && process.env['VITE_SUPABASE_URL']);
test.skip(!running && !process.env['CI'], 'Needs a Supabase to talk to; CI starts one');

// Every phone shows the one current event, so tests on the two phones take turns.
const TURN = 20261011;

// Inside the course the fixtures set up: a 4-mile circle at Canyon Ferry.
// Chromium refuses whatever is not granted, so the camera is named there;
// the iPhone has no test camera and uses the camera roll.
test.use({
  permissions: async ({ browserName }, use) => {
    await use(browserName === 'chromium' ? ['camera', 'geolocation'] : ['geolocation']);
  },
  geolocation: { latitude: 46.39, longitude: -111.57 },
});

let db: TestDb;
let director: Caller;

test.beforeEach(async () => {
  db = await TestDb.open();
  await db.admin(`select pg_advisory_lock($1)`, [TURN]);
  ({ director } = await setUpEvent(db));
});

test.afterEach(async () => {
  await db.admin(`select pg_advisory_unlock($1)`, [TURN]);
  await db.close();
});

async function register(page: Page, name: string) {
  await page.goto('/register');
  await expect(page.getByRole('status')).toHaveText('Live', { timeout: 20_000 });
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

/** A photo for the camera roll, drawn in the page so it is a real JPEG. */
async function cameraRollPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const sky = ctx.createLinearGradient(0, 0, 1600, 1200);
    sky.addColorStop(0, '#6b8f9c');
    sky.addColorStop(1, '#2f4a3a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1600, 1200);
    ctx.fillStyle = '#e8e2d0';
    ctx.fillRect(100, 500, 1400, 220);
    ctx.fillStyle = '#20302a';
    for (let x = 140; x < 1500; x += 40) ctx.fillRect(x, 690, 3, 30);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

test('files a catch with its photo, and the director’s approval arrives by itself', async ({
  page,
  browserName,
}) => {
  const name = `Catch ${browserName} ${String(Date.now())}`;
  await register(page, name);

  await page.goto('/catch');
  await page.getByLabel('Length (inches)').fill('21.5');
  if (browserName === 'chromium') {
    await page.getByRole('button', { name: 'Open camera' }).click();
    // Chromium's test picture never holds still, so shoot by hand once it shows.
    await page.getByRole('checkbox', { name: /Auto-capture/ }).uncheck();
    await expect
      .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Capture' }).click();
    await expect(page.getByRole('img', { name: 'Your catch photo, with its stamp' })).toBeVisible({
      timeout: 15_000,
    });
  } else {
    await page.getByLabel('Or choose a photo you already took').setInputFiles({
      name: 'fish.jpg',
      mimeType: 'image/jpeg',
      buffer: await cameraRollPhoto(page),
    });
  }
  await page.getByRole('button', { name: 'Submit catch for scoring' }).click();

  // My catches: sent, filed, waiting for the director.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My catches');
  await expect(page.getByText('Pending review', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Photo still sending.')).toHaveCount(0, { timeout: 20_000 });

  const [filed] = await db.admin<{ id: string; photo_path: string; within: boolean }>(
    `select c.id, c.photo_path, (e.boundary ->> 'within')::boolean as within
       from public.catches c
       join public.catch_evidence e on e.catch_id = c.id
       join public.angler_private p on p.angler_id = c.angler_id
      where p.full_name = $1 and c.length_inches = 21.5`,
    [name],
  );
  if (!filed) throw new Error('The catch did not reach the database');
  expect(filed.within).toBe(true);
  const stored = await db.admin(
    `select 1 from storage.objects where bucket_id = 'catch-photos' and name = $1`,
    [filed.photo_path],
  );
  expect(stored).toHaveLength(1);

  // The director approves; the phone hears about it with no reload.
  await db.call(director, 'director_review_catch', { p_id: filed.id, p_status: 'approved' });
  await expect(page.getByText('Approved', { exact: true })).toBeVisible({ timeout: 20_000 });

  // A fresh page: the phone signs in and reads again, so give it the time the
  // other trips to the server get.
  await page.goto('/livewell');
  await expect(page.getByText('Currently counts', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // On the gallery wall, marked yours: opened full size from the server, and
  // saved to the phone under a name it can be found by again.
  await page.goto('/gallery');
  const tile = page.getByRole('button', { name: /21\.50″ Walleye, yours$/ });
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.getByRole('img')).toBeVisible({ timeout: 20_000 });
  const download = page.waitForEvent('download');
  await viewer.getByRole('button', { name: 'Save photo' }).click();
  expect((await download).suggestedFilename()).toBe('MKWO-Walleye-21.50in.jpg');
  await viewer.getByRole('button', { name: 'Close' }).click();

  // The highlight reel, made on the phone from that one fish. Chromium records
  // it for real. The test WebKit has no video recorder at all (Safari on an
  // iPhone does), so there the card has to say so rather than offer to try.
  const reel = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Highlight reel' }) });
  if (browserName !== 'chromium') {
    await expect(reel).toContainText(/Your fish, biggest first|This browser cannot record video/);
  } else {
    await expect(reel).toContainText('Your fish, biggest first');
    await reel.getByRole('button', { name: 'Make my highlight reel' }).click();
    await expect(reel.getByText(/^Done:/)).toBeVisible({ timeout: 30_000 });
    await expect(reel.getByLabel('Your highlight reel')).toHaveAttribute('src', /^blob:/);
    const video = page.waitForEvent('download');
    await reel.getByRole('button', { name: 'Download' }).click();
    expect((await video).suggestedFilename()).toMatch(/^MKWO-2027-.+-highlights\.(mp4|webm)$/);
  }

  // In the trophy case, through the server's own answer to who this phone is:
  // a line for this tournament, and the badge the fish earned.
  await page.goto('/trophies');
  await expect(page.getByText('Looking up your earlier tournaments…')).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.getByText(/need signal/)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Tournaments fished' })).toContainText(
    '1 fish · best 21.50″',
  );
  await expect(page.getByRole('list', { name: 'Personal bests' })).toContainText('21.50″');
  await expect(
    page
      .getByRole('list', { name: 'Badges' })
      .getByRole('listitem')
      .filter({ hasText: 'Twenty-Incher' }),
  ).toContainText('Earned');
});
