import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // El backend sirve el panel como estaticos desde `<raiz>/public`
    // (ServeStaticModule en src/app.module.ts). Compilar directamente ahi evita
    // el paso manual de copiar `frontend/dist` despues de cada build, que es
    // justo el que se olvidaba y dejaba el sitio en un 404.
    outDir: '../public',
    // outDir cae fuera de la raiz del proyecto de Vite, asi que hay que
    // autorizar el vaciado de forma explicita o Vite se niega a borrarlo.
    emptyOutDir: true,
  },
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
