// Mobile Tailwind pipeline. Reuses the ROOT tailwind.config.js verbatim (theme
// ramps mapped to the CSS custom properties in src/app/globals.css) and only
// overrides `content`, because Tailwind resolves globs against the vite cwd
// (mobile/): the shared UI lives in ../src (frozen) and the shell in ./src.
const base = require('../tailwind.config.js');

module.exports = {
  ...base,
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../src/app/**/*.{js,ts,jsx,tsx}',
    '../src/components/**/*.{js,ts,jsx,tsx}',
  ],
};
