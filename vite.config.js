import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Keep asset paths relative for the Electron file:// protocol.
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          excel: ['xlsx'],
          capture: ['html2canvas'],
        },
      },
    },
  },
})
