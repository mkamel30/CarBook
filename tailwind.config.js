/** @type {import('tailwindcss').Config} */

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Maps a colour ramp onto the CSS custom properties declared in globals.css. */
function ramp(prefix) {
  const out = {};
  for (const shade of SHADES) {
    out[shade] = `rgb(var(--${prefix}-${shade}) / <alpha-value>)`;
  }
  return out;
}

module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: ramp('slate'),
        gray: ramp('gray'),
        amber: ramp('amber'),
        emerald: ramp('emerald'),
        rose: ramp('rose'),
        m3: {
          surface: 'rgb(var(--m3-surface) / <alpha-value>)',
          'surface-dim': 'rgb(var(--m3-surface-dim) / <alpha-value>)',
          'surface-container-lowest': 'rgb(var(--m3-container-lowest) / <alpha-value>)',
          'surface-container-low': 'rgb(var(--m3-container-low) / <alpha-value>)',
          'surface-container': 'rgb(var(--m3-container) / <alpha-value>)',
          'surface-container-high': 'rgb(var(--m3-container-high) / <alpha-value>)',
          'surface-container-highest': 'rgb(var(--m3-container-highest) / <alpha-value>)',
          primary: 'rgb(var(--m3-primary) / <alpha-value>)',
          'primary-container': 'rgb(var(--m3-primary-container) / <alpha-value>)',
          'on-primary': 'rgb(var(--m3-on-primary) / <alpha-value>)',
          'on-surface': 'rgb(var(--m3-on-surface) / <alpha-value>)',
          'on-surface-variant': 'rgb(var(--m3-on-surface-variant) / <alpha-value>)',
          outline: 'rgb(var(--m3-outline) / <alpha-value>)',
          'outline-variant': 'rgb(var(--m3-outline-variant) / <alpha-value>)',
        },
      },
      borderRadius: {
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        '3xl': '1.75rem', // 28px standard M3 dialog / sheet
        '2xl': '1.25rem', // 20px standard M3 card
        '4xl': '2rem',    // 32px large container
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontFamily: {
        ui: ['var(--font-ui)'],
      },
    },
  },
  plugins: [],
};
