import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Forward the real client IP to the backend
            const clientIp = req.socket.remoteAddress || '127.0.0.1';
            // Strip IPv6 prefix if present (e.g., ::ffff:192.168.1.5 → 192.168.1.5)
            const cleanIp = clientIp.replace(/^::ffff:/, '');
            proxyReq.setHeader('X-Forwarded-For', cleanIp);
            proxyReq.setHeader('X-Real-IP', cleanIp);
          });
        },
      },
      '/openapi.json': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/static': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
