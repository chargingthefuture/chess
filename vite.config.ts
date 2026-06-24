import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// NOTE: The PWA plugin (manifest + offline service worker that caches the ~7 MB
// Stockfish wasm) is added in Increment 3. Increments 1-2 run as a plain SPA so
// early testing isn't affected by service-worker caching.
export default defineConfig({
  plugins: [react()],
})
