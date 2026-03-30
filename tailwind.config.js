/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'codi-blue': '#1B3A8C',
        'codi-red': '#C8102E',
        'codi-orange': '#F47920',
        'thaihealth-orange': '#F47920',
        'thaihealth-teal': '#009688',
        'sanuk-orange': '#F7941D',
      },
      fontFamily: {
        sans: ['Sarabun', 'Noto Sans Thai', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
