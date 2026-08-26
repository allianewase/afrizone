import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 5174 so the portal and the staff admin (5173) can run side by side.
// They are separate audiences and separate deploys; running both at once is the
// normal case while building, not an edge case.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
