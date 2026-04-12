import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Permissions-Policy':
        'publickey-credentials-get=(), publickey-credentials-create=(), identity-credentials-get=(), bluetooth=(), usb=(), serial=(), hid=()',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
