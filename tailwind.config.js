/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx,md}"],
  theme: {
    extend: {
      fontFamily: {
        // Keep your current default sans; we’ll only opt-in on headings
        heading: ['Oswald', 'Montserrat', 'Inter', 'ui-sans-serif', 'system-ui'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
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
        card: '0 6px 24px rgba(0,0,0,0.08)'
      },
      backgroundImage: {
        'lab-grid': 'linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)'
      },
      backgroundSize: {
        'grid-sm': '16px 16px',
        'grid-lg': '32px 32px'
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
}