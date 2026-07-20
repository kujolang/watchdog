/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/dither-charts.tsx', './components/dither-kit/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        mono: ['Departure Mono', 'SFMono-Regular', 'Cascadia Code', 'Roboto Mono', 'Liberation Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
