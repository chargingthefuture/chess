import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        start_url: '/',
        scope: '/',
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
        // Precache the app shell AND the engine (worker JS + wasm) so the whole app
        // plays fully offline. The lite-single wasm is ~7 MB — far over Workbox's 2 MiB
        // default — so raise the per-file cap to precache it.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // Single-page app: serve index.html for navigations when offline.
        navigateFallback: 'index.html',
      },
    }),
  ],
})
