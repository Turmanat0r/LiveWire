import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = Boolean(process.env['CI']);

/**
 * The built app, served with production's security headers, on an emulated
 * Android phone and an emulated iPhone. WebKit is the engine inside every iOS
 * browser; the old app was only ever checked on one of the two.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Tests that share the one current event take turns on a database lock, and
  // waiting for a turn counts toward a test's time; the director's walk
  // through every tool is the longest turn there is. A minute covers that
  // without leaving a test that is stuck, rather than slow, running for long.
  timeout: 60_000,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'android',
      use: {
        ...devices['Pixel 7'],
        // Chromium's own test camera, so the in-app camera can be driven.
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
    { name: 'iphone', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
