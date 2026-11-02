import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const root = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'JanaVaani',
        short_name: 'JanaVaani',
        description: 'Voice-first multilingual citizen grievance platform',
        theme_color: '#070A12',
        background_color: '#F7F5F0',
        display: 'standalone',
        start_url: '/app',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/api/v1/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 6 },
          },
          {
            urlPattern: ({ request }) => request.destination === 'font' || request.destination === 'image',
            handler: 'CacheFirst',
            options: { cacheName: 'static', expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@contracts': path.resolve(root, 'packages/contracts/src'),
      '@mocks': path.resolve(root, 'packages/contracts/mocks'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: { port: 5173, fs: { allow: [root] } },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
