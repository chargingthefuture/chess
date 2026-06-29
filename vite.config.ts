import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// This deploys as a GitHub Pages project site at https://chargingthefuture.github.io/chess/,
// i.e. under the "/chess/" sub-path — not the domain root. Every built asset URL (JS, CSS, the
// engine worker + wasm, the manifest, the service worker) must be prefixed with this base or the
// page loads blank (assets 404). The engine worker URL uses import.meta.env.BASE_URL, so it picks
// this up automatically.
const BASE = '/chess/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // Auto-update the service worker in the background; no update prompt needed
      // for a personal single-user app.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Chess Coach',
        short_name: 'Chess',
        description: 'Offline chess vs Stockfish with optional AI coaching.',
        lang: 'en',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait',
        // start_url and scope must live under the sub-path so the installed app stays scoped to it.
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell AND the default engine (worker JS + ~7 MB wasm) so the whole
        // app plays fully offline. The wasm is far over Workbox's 2 MiB default, so raise the
        // per-file cap to precache it.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,webmanifest}'],
        // Do NOT precache the ~10 MB no-WebAssembly fallback engine for everyone — only the
        // (rare) browsers that block WebAssembly need it. It is runtime-cached below instead,
        // so it downloads once, on first use, for those browsers only.
        globIgnores: ['**/stockfish-18-asm.js'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // Cache the fallback engine the first time it's fetched, then serve it offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/engine/stockfish-18-asm.js'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'engine-asm-fallback',
              expiration: { maxEntries: 1 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Single-page app: serve the (base-prefixed) index.html for navigations when offline.
        navigateFallback: `${BASE}index.html`,
      },
    }),
  ],
})
