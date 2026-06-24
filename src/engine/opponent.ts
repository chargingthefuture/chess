import { UciEngine } from './uciWorker'

export type Difficulty = 'easy' | 'medium' | 'hard'

interface LevelConfig {
  /** Stockfish "Skill Level" (0-20); lower = weaker, with deliberate inaccuracies. */
  skill: number
  /** Search depth for `go depth N`. */
  depth: number
}

const LEVELS: Record<Difficulty, LevelConfig> = {
  easy: { skill: 2, depth: 5 },
  medium: { skill: 8, depth: 10 },
  hard: { skill: 20, depth: 14 },
}

// Resolve relative to the app base so it also works when hosted under a sub-path.
// The worker itself fetches `${thisDir}/stockfish.wasm` (see scripts/copy-engine.mjs).
const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`

/**
 * The skill-limited opponent. Wraps its OWN Stockfish worker — kept entirely separate
 * from the coach's worker, so neither is ever reconfigured or interrupted by the other.
 */
export class Opponent {
  private engine: UciEngine
  private ready: Promise<void>
  private appliedSkill: number | null = null

  constructor() {
    this.engine = new UciEngine(ENGINE_URL)
    this.ready = this.engine.init().then(() => this.engine.newGame())
  }

  /** Compute the bot's reply (Black) to `fen` at the given difficulty. Returns a UCI move. */
  async getMove(fen: string, difficulty: Difficulty): Promise<string> {
    await this.ready
    const { skill, depth } = LEVELS[difficulty]
    // Reconfigure skill only when it actually changed. The wrapper's queue guarantees
    // this never lands mid-search.
    if (this.appliedSkill !== skill) {
      await this.engine.setOptions([`setoption name Skill Level value ${skill}`])
      this.appliedSkill = skill
    }
    const { bestmove } = await this.engine.search(fen, `go depth ${depth}`)
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
