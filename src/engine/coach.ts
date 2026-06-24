import { Chess } from 'chess.js'
import { UciEngine } from './uciWorker'

// Resolved lazily (in the constructor) rather than at module load, so the pure helpers in
// this file (parseAnalysis/computeSwing/...) can be imported outside Vite — e.g. in Node tests.
function stockfishWorkerUrl(): string {
  return `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`
}

/** Centipassed-pawn value standing in for a forced mate, so mates sort/compare sanely. */
const MATE_CP = 100000

export interface CoachLine {
  /** First move of the line, UCI/LAN form, e.g. "e2e4". */
  move: string
  /** Score in centipawns from the side-to-move's perspective (mates mapped near ±MATE_CP). */
  scoreCp: number
  /** Mate distance in moves if this is a forced mate (+ = side to move mates), else null. */
  mate: number | null
  /** Principal variation as UCI moves. */
  pv: string[]
}

export interface CoachAnalysis {
  fen: string
  /** MultiPV lines, best first (index 1..N). */
  lines: CoachLine[]
  best: CoachLine | null
  depth: number
}

function mateToCp(mateIn: number): number {
  return mateIn > 0 ? MATE_CP - mateIn : -MATE_CP - mateIn
}

/**
 * Parse Stockfish `info ... multipv N ... score cp|mate X ... pv <moves>` lines into a
 * best-first analysis. Keeps the LAST (deepest) line seen for each multipv index. Pure +
 * unit-tested so the bug-prone parsing is verified independently of the worker.
 */
export function parseAnalysis(fen: string, infoLines: string[]): CoachAnalysis {
  const byIdx = new Map<number, CoachLine>()
  let depth = 0
  for (const line of infoLines) {
    if (!line.includes('multipv')) continue
    const idxM = line.match(/\bmultipv (\d+)\b/)
    const scoreM = line.match(/\bscore (cp|mate) (-?\d+)\b/)
    const pvM = line.match(/\bpv (.+)$/)
    if (!idxM || !scoreM || !pvM) continue
    const depthM = line.match(/\bdepth (\d+)\b/)
    if (depthM) depth = Math.max(depth, parseInt(depthM[1], 10))
    const idx = parseInt(idxM[1], 10)
    const val = parseInt(scoreM[2], 10)
    const mate = scoreM[1] === 'mate' ? val : null
    const scoreCp = scoreM[1] === 'mate' ? mateToCp(val) : val
    const pv = pvM[1].trim().split(/\s+/)
    byIdx.set(idx, { move: pv[0], scoreCp, mate, pv })
  }
  const lines = [...byIdx.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
  return { fen, lines, best: lines[0] ?? null, depth }
}

/** Convert a UCI move to SAN at a given position (for human-readable coaching text). */
export function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    })
    return move.san
  } catch {
    return uci
  }
}

/** True if two UCI moves are the same move (ignoring case). */
export function sameMove(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

export interface SwingResult {
  userSan: string
  bestSan: string
  bestUci: string
  playedBest: boolean
  /** Eval before the move, from the mover's perspective (+ = good for the mover). */
  evalBeforeCp: number
  /** Eval after the move, from the mover's perspective. */
  evalAfterCp: number
  /** How much eval the mover gave up: max(0, before - after). */
  lossCp: number
}

/**
 * Pure eval-swing math.
 *
 * `evalBeforeCp` (E0) is the best-line score at the pre-move position, from the mover's
 * perspective. After the move it's the opponent's turn, so `oppEvalAfterCp` (S1) is from the
 * OPPONENT's perspective; the mover's eval after the move is therefore -S1. The eval the
 * mover gave up is E0 - (-S1) = E0 + S1, floored at 0.
 */
export function computeSwing(params: {
  userSan: string
  userUci: string
  bestSan: string
  bestUci: string
  evalBeforeCp: number
  oppEvalAfterCp: number | null
}): SwingResult {
  const playedBest = sameMove(params.userUci, params.bestUci)
  const evalAfterCp = playedBest ? params.evalBeforeCp : -(params.oppEvalAfterCp ?? 0)
  const lossCp = Math.max(0, params.evalBeforeCp - evalAfterCp)
  return {
    userSan: params.userSan,
    bestSan: params.bestSan,
    bestUci: params.bestUci,
    playedBest,
    evalBeforeCp: params.evalBeforeCp,
    evalAfterCp,
    lossCp,
  }
}

/**
 * The Coach: a full-strength Stockfish worker with MultiPV 3. Entirely separate from the
 * opponent worker — never reconfigured or interrupted by it. Fully local; no network.
 */
export class Coach {
  private engine: UciEngine
  private ready: Promise<void>
  private depth: number

  constructor(depth = 15) {
    this.depth = depth
    this.engine = new UciEngine(stockfishWorkerUrl())
    this.ready = this.engine
      .init()
      .then(() => this.engine.setOptions(['setoption name MultiPV value 3']))
  }

  /** Analyze a position to the configured depth; returns best-first MultiPV lines. */
  async analyze(fen: string): Promise<CoachAnalysis> {
    await this.ready
    const { info } = await this.engine.search(fen, `go depth ${this.depth}`, { collectInfo: true })
    return parseAnalysis(fen, info)
  }

  newGame(): void {
    this.ready = this.ready.then(() => this.engine.newGame()).catch(() => undefined)
  }

  dispose(): void {
    this.engine.dispose()
  }
}
