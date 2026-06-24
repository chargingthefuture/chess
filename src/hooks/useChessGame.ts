import { useCallback, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Move, Color } from 'chess.js'

export interface GameStatus {
  isGameOver: boolean
  isCheckmate: boolean
  isStalemate: boolean
  isDraw: boolean
  isCheck: boolean
  turn: Color
  /** Winning color when the game ended by checkmate, else null. */
  winner: Color | null
  /** Human-readable reason the game ended, else null. */
  reason: string | null
}

export interface MoveInput {
  from: string
  to: string
  promotion?: string
}

interface GameSnapshot {
  fen: string
  status: GameStatus
  lastMove: { from: string; to: string } | null
  history: Move[]
}

function computeStatus(game: Chess): GameStatus {
  const turn = game.turn()
  const isCheckmate = game.isCheckmate()
  const isStalemate = game.isStalemate()
  const isDraw = game.isDraw()

  let winner: Color | null = null
  let reason: string | null = null
  if (isCheckmate) {
    // The side to move has been mated, so the other side won.
    winner = turn === 'w' ? 'b' : 'w'
    reason = 'Checkmate'
  } else if (isStalemate) {
    reason = 'Stalemate'
  } else if (game.isThreefoldRepetition()) {
    reason = 'Draw by repetition'
  } else if (game.isInsufficientMaterial()) {
    reason = 'Insufficient material'
  } else if (game.isDrawByFiftyMoves()) {
    reason = 'Draw by 50-move rule'
  } else if (isDraw) {
    reason = 'Draw'
  }

  return {
    isGameOver: game.isGameOver(),
    isCheckmate,
    isStalemate,
    isDraw,
    isCheck: game.isCheck(),
    turn,
    winner,
    reason,
  }
}

function snapshot(game: Chess): GameSnapshot {
  const history = game.history({ verbose: true })
  const last = history[history.length - 1]
  return {
    fen: game.fen(),
    status: computeStatus(game),
    lastMove: last ? { from: last.from, to: last.to } : null,
    history,
  }
}

export interface ChessGame extends GameSnapshot {
  /** The live chess.js instance — for read-only use (e.g. listing legal moves). */
  game: Chess
  /** Apply a move. Returns the applied Move, or null if illegal — chess.js is the only judge. */
  move: (input: MoveInput) => Move | null
  /** Apply a move in UCI/LAN form, e.g. "e2e4" or "e7e8q" (the form Stockfish emits). */
  moveUci: (uci: string) => Move | null
  /** Start a brand-new game from the initial position. */
  reset: () => void
}

/**
 * Owns the single source of truth for the game: one chess.js instance. Every layer
 * (board, engine) only reads `fen` and proposes moves; this hook validates and applies them.
 */
export function useChessGame(): ChessGame {
  const gameRef = useRef<Chess>(new Chess())
  const [snap, setSnap] = useState<GameSnapshot>(() => snapshot(gameRef.current))

  const move = useCallback((input: MoveInput): Move | null => {
    try {
      // Default to a queen promotion; chess.js ignores `promotion` on non-promotion moves.
      // chess.js throws on an illegal move — that's our legality gate, not the UI.
      const applied = gameRef.current.move({
        from: input.from,
        to: input.to,
        promotion: input.promotion ?? 'q',
      })
      setSnap(snapshot(gameRef.current))
      return applied
    } catch {
      return null
    }
  }, [])

  const moveUci = useCallback(
    (uci: string): Move | null => {
      if (uci.length < 4) return null
      return move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      })
    },
    [move],
  )

  const reset = useCallback(() => {
    gameRef.current = new Chess()
    setSnap(snapshot(gameRef.current))
  }, [])

  return {
    game: gameRef.current,
    ...snap,
    move,
    moveUci,
    reset,
  }
}
