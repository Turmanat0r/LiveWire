import { expect, test } from '@playwright/test';

/**
 * The check the old app could never make for itself: open once with signal,
 * lose it, and the app still opens - on any screen, not just the one that was
 * cached. Playwright runs service workers in Chromium only, so this is the
 * Android half; the iPhone half is a manual check on a real phone (see
 * docs/PLAN.md, "What only a phone can tell you").
 */
test('opens on any screen with no signal, once it has been opened with signal', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Playwright drives service workers in Chromium only');

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('LiveWire');
  // Wait until the offline copy is installed and in charge of the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await page.goto('/standings');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Standings');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('LiveWire');
  await context.setOffline(false);
});

/**
 * At switch-over this app replaces the old one at the same address, and an
 * installed old app hands over through its own Update button. That works only
 * while the offline worker still loads the hand-over script (see
 * public/sw-handover.js); docs/SWITCH-OVER.md has the full rehearsal.
 */
test('the offline worker still carries the hand-over from the old app', async ({ request }) => {
  const worker = await request.get('/sw.js');
  expect(worker.ok()).toBe(true);
  expect(await worker.text()).toContain('sw-handover.js');
  const handover = await request.get('/sw-handover.js');
  expect(handover.ok()).toBe(true);
  expect(await handover.text()).toContain("event.data === 'skip-waiting'");
});
