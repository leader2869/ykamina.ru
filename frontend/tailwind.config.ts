import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        ink: '#20201e',
        charcoal: '#2c2c29',
        porcelain: '#f8f7f4',
        sand: '#e9e4da',
        terracotta: { DEFAULT: '#b75435', dark: '#8f3924', light: '#d77b5e' },
        gold: { DEFAULT: '#b8914a', light: '#d7bd83' },
      },
      boxShadow: { card: '0 18px 35px -24px rgba(32, 32, 30, .5)' },
    },
  },
  plugins: [],
};

export default config;
