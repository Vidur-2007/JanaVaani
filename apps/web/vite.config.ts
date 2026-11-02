import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const root = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA (Spec A §5.17): installable, offline app shell, cache-first fonts/images/map tiles, network-first API.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/app',
        name: 'JanaVaani — speak your complaint',
        short_name: 'JanaVaani',
        description:
          'Report civic problems by voice or text in Telugu, Hindi, Urdu or English, and track them to the fix.',
        lang: 'en',
        theme_color: '#070A12',
        background_color: '#F7F5F0',
        display: 'standalone',
        scope: '/',
        start_url: '/app?source=pwa',
        categories: ['government', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          {
            name: 'Report a problem',
            short_name: 'Report',
            url: '/app/report',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Track a complaint',
            short_name: 'Track',
            url: '/track',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // App shell: every route falls back to index.html offline (but never API calls).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Fonts (several Indic subsets) are cached at runtime as they're used, not precached.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/api/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'jv-api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 24 * 3600 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'jv-fonts',
              expiration: { maxEntries: 60, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => /tile\.openstreetmap\.org$/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'jv-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'jv-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@contracts': path.resolve(root, 'packages/contracts/src'),
      '@mocks': path.resolve(root, 'packages/contracts/mocks'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: { port: 5173, fs: { allow: [root] } },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
