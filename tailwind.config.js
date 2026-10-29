/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        m3: {
          surface: '#090D16',
          'surface-dim': '#070A10',
          'surface-container-lowest': '#05070D',
          'surface-container-low': '#0F1523',
          'surface-container': '#141C2E',
          'surface-container-high': '#1B253B',
          'surface-container-highest': '#232F4A',
          primary: '#F59E0B',
          'primary-container': '#3E2805',
          'on-primary': '#000000',
          'on-surface': '#E2E8F0',
          'on-surface-variant': '#94A3B8',
          outline: '#334155',
          'outline-variant': '#1E293B',
        },
      },
      borderRadius: {
        '3xl': '1.75rem', // 28px standard M3 dialog / sheet
        '2xl': '1.25rem', // 20px standard M3 card
        '4xl': '2rem',    // 32px large container
      },
    },
  },
  plugins: [],
};
