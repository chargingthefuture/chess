/**
 * Generic UCI wrapper around a Stockfish engine.
 *
 * Stockfish speaks UCI asynchronously. This wrapper turns a search into a Promise that
 * resolves on the `bestmove` line, and — crucially — *serializes* every command through an
 * internal queue. UCI is stateful: changing options or starting a new search while the
 * engine is mid-search is misuse that makes it hang. Serializing guarantees
 * `init`/`setOptions`/`newGame`/`search` never overlap, so that can't happen.
 *
 * Each engine (opponent, coach) is a separate UciEngine instance with its own transport.
 * The transport is injectable: the app uses a Web Worker; tests can drive the same class
 * against the real engine over any transport.
 */

export interface SearchResult {
  /** Best move in UCI/LAN form, e.g. "e2e4" or "e7e8q". "(none)" if no legal move. */
  bestmove: string
  /** Suggested ponder move, if the engine offered one. */
  ponder?: string
  /** Raw `info` lines collected during the search (only when collectInfo is set). */
  info: string[]
}

/** Transport over which UCI text commands are exchanged with an engine. */
export interface UciTransport {
  send(cmd: string): void
  onLine(handler: (line: string) => void): void
  dispose(): void
}

/**
 * Default transport: a *classic* Web Worker running the Stockfish lite-single build.
 * (The build uses importScripts, so it must be a classic worker — no { type: 'module' }.)
 */
function createWorkerTransport(url: string): UciTransport {
  const worker = new Worker(url)
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (handler) => {
      worker.onmessage = (e: MessageEvent) => {
        handler(typeof e.data === 'string' ? e.data : String(e.data))
      }
    },
    dispose: () => {
      try {
        worker.postMessage('quit')
      } catch {
        /* worker may already be gone */
      }
      worker.terminate()
    },
  }
}

type LineListener = (line: string) => void

export class UciEngine {
  private transport: UciTransport
  private listeners: LineListener[] = []
  private queue: Promise<unknown> = Promise.resolve()
  private disposed = false

  /** @param source a worker URL (default Web Worker transport) or a custom transport. */
  constructor(source: string | UciTransport) {
    this.transport = typeof source === 'string' ? createWorkerTransport(source) : source
    this.transport.onLine((line) => {
      // Iterate a copy: a listener may remove itself while we're dispatching.
      for (const listen of [...this.listeners]) listen(line)
    })
  }

  private post(cmd: string): void {
    if (!this.disposed) this.transport.send(cmd)
  }

  private onLine(fn: LineListener): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  /** Resolve once a line starting with `token` arrives (e.g. "uciok", "readyok"). */
  private waitFor(token: string, timeoutMs = 20000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const off = this.onLine((line) => {
        if (line.startsWith(token)) {
          clearTimeout(timer)
          off()
          resolve()
        }
      })
      const timer = setTimeout(() => {
        off()
        reject(new Error(`UCI timeout waiting for "${token}"`))
      }, timeoutMs)
    })
  }

  /** Serialize an operation so engine commands never interleave. */
  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op, op)
    // Keep the chain alive regardless of whether an individual op resolves or rejects.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Handshake: uci -> uciok, isready -> readyok. */
  init(): Promise<void> {
    return this.enqueue(async () => {
      this.post('uci')
      await this.waitFor('uciok')
      this.post('isready')
      await this.waitFor('readyok')
    })
  }

  /** Apply setoption commands (e.g. "setoption name Skill Level value 8"). */
  setOptions(options: string[]): Promise<void> {
    return this.enqueue(async () => {
      for (const o of options) this.post(o)
      this.post('isready')
      await this.waitFor('readyok')
    })
  }

  /** Tell the engine a new game is starting (clears its hash/history). */
  newGame(): Promise<void> {
    return this.enqueue(async () => {
      this.post('ucinewgame')
      this.post('isready')
      await this.waitFor('readyok')
    })
  }

  /**
   * Search a FEN position. Resolves on `bestmove`.
   * @param goCmd e.g. "go depth 12" or "go movetime 1000".
   * @param opts.collectInfo collect `info` lines (the coach parses these for MultiPV).
   */
  search(fen: string, goCmd: string, opts: { collectInfo?: boolean } = {}): Promise<SearchResult> {
    return this.enqueue(
      () =>
        new Promise<SearchResult>((resolve) => {
          const info: string[] = []
          const off = this.onLine((line) => {
            if (opts.collectInfo && line.startsWith('info')) {
              info.push(line)
            } else if (line.startsWith('bestmove')) {
              off()
              const parts = line.split(/\s+/)
              resolve({ bestmove: parts[1] ?? '(none)', ponder: parts[3], info })
            }
          })
          this.post(`position fen ${fen}`)
          this.post(goCmd)
        }),
    )
  }

  dispose(): void {
    this.disposed = true
    this.transport.dispose()
    this.listeners = []
  }
}
