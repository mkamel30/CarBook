import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Explicit include so both the colocated src/ suites and tests/ run by
    // default under `pnpm test` (CI). Nothing under src/** or tests/** that
    // looks like a *.test.ts is excluded.
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    // The suites that touch libsql/open a NextRequest are I/O-bound, and with 48
    // files in parallel workers the default 5s cliff trips on wall-clock queueing,
    // not on slow logic: the same cases finish in ~1.5s when run alone. Bounded so
    // a genuine hang still fails, just well past the contention window.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
