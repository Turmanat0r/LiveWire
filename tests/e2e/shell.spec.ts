import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Collect anything the page reports as broken, including CSP refusals. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test('opens cleanly under the production security policy', async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto('/');
  await expect(heading(page)).toHaveText('LiveWire');
  expect(errors).toEqual([]);
});

test('the cascade layers rank in the order the stylesheet names them', async ({ page }) => {
  // Layers rank by first mention. If any component's CSS is bundled ahead of
  // the declaration in styles/index.css, base styles start beating components.
  await page.goto('/');
  // The minifier may drop the declaration itself when the blocks already come
  // in order, so this reads the order the browser actually sees.
  const order = await page.evaluate(() => {
    const seen: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        const names =
          rule instanceof CSSLayerStatementRule
            ? [...rule.nameList]
            : rule instanceof CSSLayerBlockRule
              ? [rule.name]
              : [];
        for (const name of names) if (!seen.includes(name)) seen.push(name);
      }
    }
    return seen;
  });
  expect(order).toEqual(['reset', 'tokens', 'base', 'layout', 'components', 'utilities']);
});

test('the tab bar and the Back button walk the app', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Standings' }).click();
  await expect(page).toHaveURL(/\/standings$/);
  await expect(heading(page)).toHaveText('Standings');
  await expect(heading(page)).toBeFocused();
  await nav.getByRole('link', { name: 'Chat' }).click();
  await expect(heading(page)).toHaveText('Chat');
  await page.goBack();
  await expect(heading(page)).toHaveText('Standings');
  await page.goBack();
  await expect(heading(page)).toHaveText('LiveWire');
});

test('a shared link opens its screen, and survives a refresh', async ({ page }) => {
  await page.goto('/safety');
  await expect(heading(page)).toHaveText('Safety');
  await page.reload();
  await expect(heading(page)).toHaveText('Safety');
});

test('the tab bar stays reachable and sized for a thumb', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
  await expect(links).toHaveCount(5);
  for (const link of await links.all()) {
    await expect(link).toBeInViewport();
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
  }
});

// One screen per colour theme. Like the old app, LiveWire looks the same with
// the phone in dark mode, which the home screen checks.
for (const [path, colorScheme] of [
  ['/', 'light'],
  ['/', 'dark'],
  ['/register', 'light'],
  ['/check-in', 'light'],
  ['/catch', 'light'],
  ['/my-catches', 'light'],
  ['/livewell', 'light'],
  ['/standings', 'light'],
  ['/side-bets', 'light'],
  ['/safety', 'light'],
  ['/chat', 'light'],
  ['/director', 'light'],
  ['/no-such-screen', 'light'],
] as const) {
  test(`no accessibility violations at ${path} in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(path);
    await expect(heading(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
