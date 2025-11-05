import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // 🧱 Optimisation du bundle
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
    outDir: 'dist', // ✅ important pour le prérendu
  },

  // 🧭 Permet d'éviter les 404 en mode preview ou dev
  server: {
    historyApiFallback: true, // React Router fonctionne en local
  },
  preview: {
    historyApiFallback: true, // idem pour le serveur de prévisualisation
  },
})
