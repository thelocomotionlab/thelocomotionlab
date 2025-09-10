/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#FEFBF6',
          primary: '#8CB9BD',
          accent: '#EFB159',
          deep: '#B67352',
          text: '#333333',
        }
      },
      boxShadow: {
        card: '0 6px 24px rgba(0,0,0,0.08)'
      }
    },
  },
  plugins: [],
}
