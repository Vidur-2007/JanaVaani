import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

/**
 * P6 first paint: index.html carries a self-contained static boot shell. Nothing else may compete with it, so
 * the entry module, its modulepreloads, the app stylesheet and the two critical Latin fonts are injected one
 * frame after first paint (all at once, so they still download in parallel). app/boot.ts keeps the shell up
 * until the stylesheet (`data-jv-css`) has applied and React has rendered the real page.
 */
function deferBootAssets(fontPatterns: RegExp[]): Plugin {
  return {
    name: 'jv-defer-boot-assets',
    enforce: 'post',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const entry = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/.exec(html);
        if (!entry) return html;
        const preloads: string[] = [];
        const css: string[] = [];
        let out = html.replace(entry[0], '');
        out = out.replace(/<link rel="modulepreload" crossorigin href="([^"]+)">\s*/g, (_m, h: string) => {
          preloads.push(h);
          return '';
        });
        out = out.replace(/<link rel="stylesheet" crossorigin href="([^"]+\.css)">\s*/g, (_m, h: string) => {
          css.push(h);
          return '';
        });
        const fonts = Object.keys(ctx.bundle ?? {})
          .filter((f) => f.endsWith('.woff2') && fontPatterns.some((re) => re.test(f)))
          .map((f) => `/${f}`);
        const data = JSON.stringify({ e: entry[1], m: preloads, c: css, f: fonts });
        const loader =
          `<script>(function(a){var done=false;function el(t,p){var x=document.createElement(t);for(var k in p)x.setAttribute(k,p[k]);document.head.appendChild(x);}` +
          `function go(){if(done)return;done=true;a.c.forEach(function(h){el('link',{rel:'stylesheet',href:h,crossorigin:'','data-jv-css':''});});` +
          `a.f.forEach(function(h){el('link',{rel:'preload',as:'font',type:'font/woff2',href:h,crossorigin:''});});` +
          `a.m.forEach(function(h){el('link',{rel:'modulepreload',href:h,crossorigin:''});});el('script',{type:'module',src:a.e,crossorigin:''});}` +
          `requestAnimationFrame(function(){setTimeout(go,0);});setTimeout(go,120);})(${data});</script>` +
          css.map((h) => `<noscript><link rel="stylesheet" href="${h}"></noscript>`).join('');
        return out.replace('</body>', `${loader}\n  </body>`);
      },
    },
  };
}

const root = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    deferBootAssets([/anek-latin-latin-wght-normal/, /noto-sans-latin-400-normal/]),
    // PWA (Spec A §5.17): installable, offline app shell, cache-first fonts/images/map tiles, network-first API.
    VitePWA({
      registerType: 'autoUpdate',
      // Deferred: the registration script must never block first paint.
      injectRegister: 'script-defer',
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
        // P6: don't make every first visit download ~1 MB of optional lazy code (3D hero/orb, PDF export).
        // They're cached at runtime once used (see the jv-lazy-js rule below); offline they degrade gracefully.
        globIgnores: ['**/react-three-fiber*.js', '**/CityPulse*.js', '**/VoiceOrbGL*.js', '**/jspdf*.js', '**/html2canvas*.js', '**/purify.es*.js', '**/index.es*.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Explicit: with injectRegister 'script-defer' the plugin no longer implies these for autoUpdate.
        clientsClaim: true,
        skipWaiting: true,
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
            urlPattern: ({ url, request }) => request.destination === 'script' && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'jv-lazy-js', expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 3600 } },
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
