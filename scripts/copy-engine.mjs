// Copies the Stockfish engine files from node_modules into public/engine/.
//
// IMPORTANT — do NOT rename the wasm. The lite-single worker derives its binary's name from
// its OWN filename: loaded as `<dir>/stockfish-18-lite-single.js`, it fetches
// `<dir>/stockfish-18-lite-single.wasm`. So the wasm must keep that exact name next to the
// worker. Renaming it (an earlier version renamed it to "stockfish.wasm") makes the fetch
// 404 — the engine never starts and the bot never moves.
//
// stockfish-18-asm.js is the self-contained pure-JavaScript fallback (no WebAssembly), used
// when WASM is blocked (e.g. iOS Lockdown Mode). It embeds everything it needs; no extra file.
//
// This is tolerant of a missing source: a fresh clone already contains the committed
// public/engine files, so the build still works offline even if node_modules/stockfish
// (whose postinstall fetches the engine over the network) isn't populated.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const srcDir = resolve(root, 'node_modules/stockfish/bin')
const outDir = resolve(root, 'public/engine')

const jobs = [
  ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.js'],
  // Keep the wasm's original name — the worker fetches it by that name (see header above).
  ['stockfish-18-lite-single.wasm', 'stockfish-18-lite-single.wasm'],
  // Pure-JavaScript fallback used when WebAssembly is blocked (e.g. iOS Lockdown Mode).
  ['stockfish-18-asm.js', 'stockfish-18-asm.js'],
]

try {
  if (!existsSync(srcDir)) {
    console.log('[copy-engine] node_modules/stockfish not found; using committed public/engine files.')
    process.exit(0)
  }
  mkdirSync(outDir, { recursive: true })
  for (const [from, to] of jobs) {
    const src = resolve(srcDir, from)
    if (!existsSync(src)) {
      console.warn(`[copy-engine] missing ${from}; keeping committed copy.`)
      continue
    }
    copyFileSync(src, resolve(outDir, to))
    console.log(`[copy-engine] ${from} -> public/engine/${to}`)
  }
} catch (err) {
  console.warn('[copy-engine] skipped:', err.message)
}
