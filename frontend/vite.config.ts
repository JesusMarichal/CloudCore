import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'X-Frame-Options':           'DENY',
      'X-Content-Type-Options':    'nosniff',
      'X-XSS-Protection':          '1; mode=block',
      'Referrer-Policy':           'strict-origin-when-cross-origin',
      'Permissions-Policy':        'camera=(), microphone=(), geolocation=()',
      // HSTS no aplica en dev (HTTP localhost). Activarlo en producción detrás de HTTPS.
    },
  },
})
