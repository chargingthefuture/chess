// Copies the Stockfish "lite-single" worker + wasm from node_modules into public/engine/.
//
// Why rename the wasm to "stockfish.wasm": the lite-single worker resolves its binary as
// `${scriptDirectory}stockfish.wasm` by default (it does NOT derive the name from its own
// filename), so the wasm must sit next to the worker under that exact name.
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
  ['stockfish-18-lite-single.wasm', 'stockfish.wasm'],
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
