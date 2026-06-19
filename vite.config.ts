import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Minimal ambient declaration for the single Node global this config reads.
// `@types/node` is intentionally not a dependency of this frontend project, so
// we narrowly type `process.env` here instead of pulling in the full Node types.
declare const process: { env: Record<string, string | undefined> };

// Vite + React config for the bread tour SPA.
// Test config (Vitest) is colocated here per Vite convention.
export default defineConfig({
  plugins: [react()],
  // Base public path. Defaults to '/' for local dev and root deployments.
  // The GitHub Pages workflow injects BASE_PATH=/<repo>/ so assets and routing
  // resolve under the project-site subpath without hardcoding the repo name.
  base: process.env.BASE_PATH || '/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // Use the child-process (forks) pool rather than worker threads. On this
    // toolchain the threads pool fails to apply Vitest's `vi.mock` hoisting
    // transform, which silently breaks every module mock and produces FALSE
    // failures (e.g. "X is not a spy"). Forks runs the same transform pipeline
    // correctly, so `npm test` gives a true signal.
    pool: 'forks',
    // Cap fork concurrency. With the default unbounded fork count this machine
    // oversubscribes its cores, and the resulting contention intermittently
    // drops Vitest's `vi.mock` hoisting transform on some files — producing the
    // same FALSE "X is not a spy" failures as the threads pool. Pinning a small
    // pool keeps the transform pipeline deterministic so `npm test` is reliable.
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 2,
      },
    },
    // Dummy public env vars so src/lib/supabase.ts does not throw during tests.
    // These are NOT real keys; the Supabase client is mocked in each test.
    env: {
      VITE_SUPABASE_URL: 'https://supabase.com/dashboard/project/whmppdnszibvyythepea',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_JTBhDseVix0ztmiLYOzP6Q_SlVeQT76',
      VITE_KAKAO_MAP_APP_KEY: 'dde4b0245ba4cf1eb65eaaf8369c671f',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/features/**', 'src/hooks/**', 'src/pages/**'],
    },
  },
});
