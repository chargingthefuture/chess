import type { CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'
import type { Arrow, PieceDropHandlerArgs, SquareHandlerArgs } from 'react-chessboard'

export interface BoardProps {
  /** Current position as a FEN string — the contract between every layer. */
  fen: string
  orientation?: 'white' | 'black'
  /** Called on drop. Return true to accept the move, false to snap the piece back. */
  onMove: (from: string, to: string) => boolean
  /** Called when a square is clicked/tapped — drives tap-to-move (select source, then target). */
  onSquareActivate?: (square: string) => void
  allowDragging?: boolean
  /** Coach arrows (e.g. best-move from→to). */
  arrows?: Arrow[]
  /** Per-square highlight styles (best move, cursor, selection, legal targets). */
  squareStyles?: Record<string, CSSProperties>
}

/**
 * react-chessboard v5 wrapper. v5 takes a single `options` object prop (NOT the old
 * `position` / `onPieceDrop` separate props). The board only proposes moves; legality
 * is decided upstream by chess.js inside `onMove`.
 */
export function Board({
  fen,
  orientation = 'white',
  onMove,
  onSquareActivate,
  allowDragging = true,
  arrows,
  squareStyles,
}: BoardProps) {
  const options = {
    id: 'main-board',
    position: fen,
    boardOrientation: orientation,
    allowDragging,
    showAnimations: true,
    animationDurationInMs: 200,
    arrows: arrows ?? [],
    squareStyles: squareStyles ?? {},
    darkSquareStyle: { backgroundColor: '#769656' },
    lightSquareStyle: { backgroundColor: '#eeeed2' },
    onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (!targetSquare) return false // dragged off the board
      return onMove(sourceSquare, targetSquare)
    },
    onSquareClick: ({ square }: SquareHandlerArgs): void => {
      onSquareActivate?.(square)
    },
  }

  return (
    <div className="board-wrap">
      <Chessboard options={options} />
    </div>
  )
}
