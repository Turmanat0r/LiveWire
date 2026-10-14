import { readdirSync, readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
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
function productionHeaders(server: string | undefined): Record<string, string> {
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
  // Production talks to *.supabase.co, which the policy names. The browser
  // tests talk to a Supabase on this machine; let the policy name that too.
  const csp = out['Content-Security-Policy'];
  if (csp && server && !new URL(server).hostname.endsWith('.supabase.co')) {
    const { origin, host } = new URL(server);
    out['Content-Security-Policy'] = csp
      .replace(/connect-src ([^;]*)/, `connect-src $1 ${origin} ws://${host}`)
      .replace(/img-src ([^;]*)/, `img-src $1 ${origin}`);
  }
  return out;
}

/**
 * The newest migration's name. The phone throws away a saved copy made by a
 * build that expected another database, rather than reading old shapes.
 */
function schemaVersion(): string {
  const migrations = readdirSync(new URL('./supabase/migrations/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return migrations.at(-1)?.replace(/\.sql$/, '') ?? 'none';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // A deploy with no server would open, look fine, and never sync a thing.
  if (
    process.env['VERCEL'] &&
    !(env['VITE_SUPABASE_URL'] && env['VITE_SUPABASE_PUBLISHABLE_KEY'])
  ) {
    throw new Error(
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the Vercel project (see README).',
    );
  }
  return {
    define: {
      'import.meta.env.VITE_SCHEMA_VERSION': JSON.stringify(schemaVersion()),
    },
    preview: {
      headers: productionHeaders(env['VITE_SUPABASE_URL']),
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
              // A catch photo never changes once filed. Its address carries a
              // token that lapses within the hour, so it is cached by path
              // alone: a photo seen once shows again with no signal.
              urlPattern: /\/storage\/v1\/object\/sign\/catch-photos\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'catch-photos',
                matchOptions: { ignoreSearch: true },
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // Map tiles are the one thing that genuinely needs signal. Keep the
              // ones already seen so the course map still draws out on the water.
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'map-tiles',
                expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
                // Fetched with CORS (the map asks for it), so a failure is never
                // an opaque response kept in place of a tile.
                cacheableResponse: { statuses: [200] },
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
            // The database: every migration applied to a fresh Postgres, and every
            // rule acted out as an angler, a teammate, a stranger and the director.
            // In CI, SUPABASE_DB_URL points the same tests at the real Supabase.
            name: 'db',
            include: ['tests/db/**/*.test.ts'],
            environment: 'node',
            // One database per file locally; one shared database in CI, where
            // "the current event" is a single row, so files run one at a time.
            fileParallelism: false,
            testTimeout: 60_000,
            hookTimeout: 60_000,
          },
        },
        {
          extends: true,
          test: {
            // The app's server adapter against a real Supabase: sign-in,
            // refusals, photos and live signals. CI starts one; elsewhere these
            // are skipped.
            name: 'remote',
            include: ['tests/remote/**/*.test.ts'],
            environment: 'node',
            fileParallelism: false,
            testTimeout: 60_000,
            hookTimeout: 60_000,
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
  };
});
