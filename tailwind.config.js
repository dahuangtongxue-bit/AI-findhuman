/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  // 头像/渐变用到的动态色，统一兜底，避免被 JIT 漏掉
  safelist: [
    { pattern: /(bg|text|ring|border)-(rose|sky|amber|emerald|violet|cyan|slate)-(50|100|200|300|400|500|600|700|800|900)/ },
    { pattern: /(from|to)-(rose|amber|violet)-(50|100|500)/ },
    'fill-amber-400',
  ],
  plugins: [],
};
