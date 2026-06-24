import { useEffect, useRef, useState } from 'react'
import { Board } from './components/Board'
import { Controls } from './components/Controls'
import { GameOverDialog } from './components/GameOverDialog'
import { useChessGame } from './hooks/useChessGame'
import { Opponent } from './engine/opponent'
import type { Difficulty } from './engine/opponent'

/**
 * Increment 2: you play White against a skill-limited Stockfish bot (Black) at
 * Easy / Medium / Hard. chess.js still owns legality; FEN is handed to the
 * opponent worker, whose reply is applied back through chess.js.
 */
export default function App() {
  const game = useChessGame()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [thinking, setThinking] = useState(false)

  // Own the opponent worker for the lifetime of the app.
  const opponentRef = useRef<Opponent | null>(null)
  useEffect(() => {
    const opponent = new Opponent()
    opponentRef.current = opponent
    return () => {
      opponentRef.current = null
      opponent.dispose()
    }
  }, [])

  // The bot (Black) replies whenever it's Black's turn and the game is still live.
  // Depend on primitives (not the `game` object, which is a fresh reference each render);
  // game.moveUci is stable across renders.
  useEffect(() => {
    if (game.status.isGameOver || game.status.turn !== 'b') return
    const opponent = opponentRef.current
    if (!opponent) return

    let cancelled = false
    setThinking(true)
    opponent
      .getMove(game.fen, difficulty)
      .then((uci) => {
        if (cancelled || !uci || uci === '(none)') return
        game.moveUci(uci)
      })
      .catch(() => {
        /* engine unavailable: leave it as Black's turn rather than breaking the game */
      })
      .finally(() => {
        if (!cancelled) setThinking(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fen, game.status.turn, game.status.isGameOver, difficulty])

  const isUsersTurn = game.status.turn === 'w' && !game.status.isGameOver

  const handleMove = (from: string, to: string): boolean => {
    if (!isUsersTurn) return false // you play White only
    return game.move({ from, to }) !== null
  }

  const handleNewGame = () => {
    opponentRef.current?.newGame()
    setThinking(false)
    game.reset()
  }

  const statusText = game.status.isGameOver
    ? 'Game over'
    : thinking
      ? 'Black is thinking…'
      : isUsersTurn
        ? 'Your move'
        : 'Black to move'

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Chess Coach</h1>
        <span className="app__subtitle">You play White</span>
      </header>

      <Controls difficulty={difficulty} onDifficultyChange={setDifficulty} />

      <Board fen={game.fen} onMove={handleMove} allowDragging={isUsersTurn && !thinking} />

      <div className="statusbar">
        <span className="statusbar__turn">
          <span className={`turn-dot turn-dot--${game.status.turn}`} />
          {statusText}
        </span>
        {game.status.isCheck && !game.status.isCheckmate && (
          <span className="statusbar__msg statusbar__msg--check">Check!</span>
        )}
        <button onClick={handleNewGame}>New game</button>
      </div>

      <GameOverDialog status={game.status} onPlayAgain={handleNewGame} />
    </div>
  )
}
