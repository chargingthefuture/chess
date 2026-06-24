import type { GameStatus } from '../hooks/useChessGame'

export interface GameOverDialogProps {
  status: GameStatus
  onPlayAgain: () => void
}

export function GameOverDialog({ status, onPlayAgain }: GameOverDialogProps) {
  if (!status.isGameOver) return null

  const title = status.isCheckmate ? 'Checkmate' : 'Game over'
  const subtitle = status.isCheckmate
    ? `${status.winner === 'w' ? 'White' : 'Black'} wins`
    : (status.reason ?? 'Draw')

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="dialog">
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <button className="btn--primary" onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </div>
  )
}
