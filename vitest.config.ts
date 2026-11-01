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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
