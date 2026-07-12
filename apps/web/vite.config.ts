import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev proxies /api and /ping to the Fastify server so the SPA and API share an
// origin (the session cookie is host-only, SameSite=Lax).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
      '/ping': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
})
