/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx,md}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Ubuntu', 'ui-sans-serif', 'system-ui'],
        sans: ['Ubuntu', 'ui-sans-serif', 'system-ui'],
        serif: ['"Ubuntu Serif"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        lora: ['Lora', 'serif']
      },
      colors: {
        brand: {
          bg: '#FEFBF6',
          primary: '#8CB9BD',
          accent: '#EFB159',
          deep: '#B67352',
          text: '#333333',
          paper: '#FFFFFF',
          grid: '#F3EEE6'
        }
      },
      boxShadow: {
        card: '0 6px 24px rgba(0,0,0,0.08)',
        cta: '0 10px 24px rgba(0,0,0,0.20)', // ajout pour les boutons CTA
      },
      backgroundImage: {
        'lab-grid': 'linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)'
      },
      backgroundSize: {
        'grid-sm': '16px 16px',
        'grid-lg': '32px 32px'
      },
      fontSize: {
        'xxs': '0.625rem', // ≈ 10px
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
