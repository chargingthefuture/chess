// Picks the Stockfish worker build and bounds search time, with a no-WebAssembly fallback.
//
// iOS Lockdown Mode (and some content blockers) disable WebAssembly. The default engine is the
// fast lite-single WASM build; when WASM can't compile we fall back to the pure-JavaScript asm.js
// build — larger and slower, but it runs where WASM is blocked. Detection is a synchronous probe.

const WASM_WORKER = 'engine/stockfish-18-lite-single.js'
const ASM_WORKER = 'engine/stockfish-18-asm.js'

let cached: boolean | null = null

/** True if the browser can actually compile WebAssembly (false under iOS Lockdown Mode, etc.). */
export function isWasmSupported(): boolean {
  if (cached !== null) return cached
  try {
    if (typeof WebAssembly !== 'object' || typeof WebAssembly.Module !== 'function') {
      cached = false
      return cached
    }
    // Minimal valid module ("\0asm" + version 1). Compiling it throws when WASM is blocked.
    const module = new WebAssembly.Module(
      Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00),
    )
    cached = module instanceof WebAssembly.Module
  } catch {
    cached = false
  }
  return cached
}

/** URL of the worker build to use, resolved against the app base (works under a sub-path). */
export function engineWorkerUrl(): string {
  const file = isWasmSupported() ? WASM_WORKER : ASM_WORKER
  return `${import.meta.env.BASE_URL}${file}`
}

/**
 * The `go` command for a search. On the WASM engine, search to `depth`. On the slower asm.js
 * fallback, bound by time instead so a move never takes too long.
 */
export function goCommand(depth: number, fallbackMovetimeMs: number): string {
  return isWasmSupported() ? `go depth ${depth}` : `go movetime ${fallbackMovetimeMs}`
}
