import { Board } from './components/Board'
import { GameOverDialog } from './components/GameOverDialog'
import { useChessGame } from './hooks/useChessGame'

/**
 * Increment 1: a playable hot-seat board. Two humans take turns on one screen;
 * chess.js enforces legality; checkmate / draw shows the restart dialog.
 * The Stockfish opponent, PWA, Coach and Explain features layer on in later increments.
 */
export default function App() {
  const game = useChessGame()

  const handleMove = (from: string, to: string): boolean => game.move({ from, to }) !== null

  const turnLabel = game.status.turn === 'w' ? 'White' : 'Black'

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Chess Coach</h1>
        <span className="app__subtitle">Local two-player</span>
      </header>

      <Board fen={game.fen} onMove={handleMove} />

      <div className="statusbar">
        <span className="statusbar__turn">
          <span className={`turn-dot turn-dot--${game.status.turn}`} />
          {game.status.isGameOver ? 'Game over' : `${turnLabel} to move`}
        </span>
        {game.status.isCheck && !game.status.isCheckmate && (
          <span className="statusbar__msg statusbar__msg--check">Check!</span>
        )}
        <button onClick={game.reset}>New game</button>
      </div>

      <GameOverDialog status={game.status} onPlayAgain={game.reset} />
    </div>
  )
}
