import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// เวอร์ชันแอปมาจาก package.json ที่เดียว (เดิมอ่านจาก public/SettingApp.txt ซึ่งถูกยกเลิกไปแล้ว)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Relative asset paths so the build works from any sub-path on a static host.
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
