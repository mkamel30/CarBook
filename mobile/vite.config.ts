import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';

// Regex `find` aliases (not bare strings) so the '@' / '@app' prefixes never
// hijack npm packages that start with '@' (e.g. '@nozbe/watermelondb'): each
// matches only when followed by '/'. The mobile app imports the REAL shared UI
// under ../src — never a copy — so the two surfaces cannot diverge (src/** is
// frozen).
const srcRoot = fileURLToPath(new URL('../src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // '@app/<x>' -> ../src/<x>: mount the web page/components unchanged.
      { find: /^@app\/(.*)$/, replacement: `${srcRoot}/$1` },
      // Shared components import each other through the web app's '@/*' alias.
      { find: /^@\/(.*)$/, replacement: `${srcRoot}/$1` },
      // The shared sync client lives at the repo root's src/sync — mobile/ has no
      // copy of its own; this alias previously pointed at a nonexistent directory.
      { find: /^@sync\/(.*)$/, replacement: `${srcRoot}/sync/$1` },
      { find: /^@device\/(.*)$/, replacement: fileURLToPath(new URL('./src/device/$1', import.meta.url)) },
    ],
  },
  server: {
    fs: { allow: ['..'] },
  },
  css: {
    // Tailwind pipeline for the shared UI. Plugins are wired inline (rather
    // than via a postcss.config file) so they apply deterministically whatever
    // cwd vite is launched from. tailwindcss picks up mobile/tailwind.config.cjs.
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
