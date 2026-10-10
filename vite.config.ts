import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The security headers production sends, read from vercel.json so `vite
 * preview` (and the browser tests that run against it) see the same policy.
 * One copy of the policy, not two that can drift. Two are left out locally:
 * HSTS and upgrade-insecure-requests would force a plain-http localhost onto
 * https that is not there.
 */
function productionHeaders(): Record<string, string> {
  const config: unknown = JSON.parse(
    readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
  );
  const out: Record<string, string> = {};
  if (typeof config !== 'object' || config === null || !('headers' in config)) return out;
  const rules = Array.isArray(config.headers) ? (config.headers as unknown[]) : [];
  for (const rule of rules) {
    if (typeof rule !== 'object' || rule === null) continue;
    if (!('source' in rule) || rule.source !== '/(.*)' || !('headers' in rule)) continue;
    for (const h of Array.isArray(rule.headers) ? (rule.headers as unknown[]) : []) {
      if (typeof h !== 'object' || h === null || !('key' in h) || !('value' in h)) continue;
      if (typeof h.key !== 'string' || typeof h.value !== 'string') continue;
      if (h.key === 'Strict-Transport-Security') continue;
      out[h.key] = h.value.replace(/;\s*upgrade-insecure-requests/, '');
    }
  }
  return out;
}

export default defineConfig({
  preview: {
    headers: productionHeaders(),
  },
  plugins: [
    react(),
    VitePWA({
      // The app asks before swapping itself out, so an angler mid-catch is never
      // reloaded underneath. See src/app/UpdatePrompt.tsx.
      registerType: 'prompt',
      // Registered from our own bundle, so no inline script is needed and the
      // Content-Security-Policy can stay script-src 'self'.
      injectRegister: false,
      manifest: {
        name: 'LiveWire',
        short_name: 'LiveWire',
        description: 'Catch, photo and release scoring for kayak fishing tournaments',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b0f10',
        theme_color: '#24404d',
        icons: [
          { src: '/icons/livewire-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/livewire-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/livewire-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Every built file is content-hashed and precached as one set. A phone
        // either has the whole new version or keeps the whole old one; it can
        // never mix this deploy's page with last deploy's stylesheet.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Map tiles are the one thing that genuinely needs signal. Keep the
            // ones already seen so the course map still draws out on the water.
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          // The old app, run as an oracle: the same random tournaments go
          // through both and the answers must match. Needs the old app built
          // (`npm run build` in the repository root). Deleted at cutover.
          name: 'parity',
          include: ['tests/parity/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
    ],
  },
});
