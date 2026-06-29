import { UciEngine } from './uciWorker'
import { engineWorkerUrl, goCommand } from './engineUrl'

export type Difficulty = 'easy' | 'medium' | 'hard'

interface LevelConfig {
  /** Stockfish "Skill Level" (0-20); lower = weaker, with deliberate inaccuracies. */
  skill: number
  /** Search depth for `go depth N` (on the WASM engine). */
  depth: number
}

const LEVELS: Record<Difficulty, LevelConfig> = {
  easy: { skill: 2, depth: 5 },
  medium: { skill: 8, depth: 10 },
  hard: { skill: 20, depth: 14 },
}

// On the slow asm.js fallback, bound each reply by time instead of depth.
const FALLBACK_MOVETIME_MS = 2000

/**
 * The skill-limited opponent. Wraps its OWN Stockfish worker — kept entirely separate from the
 * coach's worker, so neither is ever reconfigured or interrupted by the other.
 */
export class Opponent {
  private engine: UciEngine
  /** Resolves once the engine has finished its first handshake; rejects if it can't start. */
  private initialized: Promise<void>
  private ready: Promise<void>
  private appliedSkill: number | null = null

  constructor() {
    this.engine = new UciEngine(engineWorkerUrl())
    this.initialized = this.engine.init().then(() => this.engine.newGame())
    this.ready = this.initialized
  }

  /** Resolves when the engine is ready; rejects if it failed to start (e.g. blocked engine). */
  whenReady(): Promise<void> {
    return this.initialized
  }

  /** Compute the bot's reply (Black) to `fen` at the given difficulty. Returns a UCI move. */
  async getMove(fen: string, difficulty: Difficulty): Promise<string> {
    await this.ready
    const { skill, depth } = LEVELS[difficulty]
    // Reconfigure skill only when it actually changed. The wrapper's queue guarantees this
    // never lands mid-search.
    if (this.appliedSkill !== skill) {
      await this.engine.setOptions([`setoption name Skill Level value ${skill}`])
      this.appliedSkill = skill
    }
    const { bestmove } = await this.engine.search(fen, goCommand(depth, FALLBACK_MOVETIME_MS))
    return bestmove
  }

  /** Reset engine state for a brand-new game (best effort). */
  newGame(): void {
    this.ready = this.ready.then(() => this.engine.newGame()).catch(() => undefined)
  }

  dispose(): void {
    this.engine.dispose()
  }
}
