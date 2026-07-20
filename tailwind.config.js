/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/dither-charts.tsx', './components/dither-kit/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
