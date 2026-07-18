import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-display)', 'Georgia', 'ui-serif', 'serif'],
      },
      colors: {
        ink: '#1d1d1b',
        charcoal: '#2c2c29',
        porcelain: '#f5f3ef',
        sand: '#e9e4da',
        terracotta: { DEFAULT: '#a9492f', dark: '#873522', light: '#d77b5e' },
        gold: { DEFAULT: '#a67c3d', light: '#d7bd83' },
      },
      boxShadow: { card: '0 18px 35px -27px rgba(29, 29, 27, .45)' },
    },
  },
  plugins: [],
};

export default config;
