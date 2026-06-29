import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import type { Move, Square } from 'chess.js'
import { Board } from './components/Board'
import { Controls } from './components/Controls'
import { GameOverDialog } from './components/GameOverDialog'
import { CoachPanel } from './components/CoachPanel'
import { useChessGame } from './hooks/useChessGame'
import { Opponent } from './engine/opponent'
import type { Difficulty } from './engine/opponent'
import { isWasmSupported } from './engine/engineUrl'
import { Coach, computeSwing, sameMove, uciToSan } from './engine/coach'
import type { CoachAnalysis, SwingResult } from './engine/coach'
import { explain } from './coaching/explain'
import { getCachedExplanation, setCachedExplanation } from './coaching/explainCache'
import { useGamepad } from './hooks/useGamepad'
import { stepSquare } from './input/boardNav'
import type { Dir } from './input/boardNav'

const HINT_COLOR = '#2e9b3e'
const API_KEY_LS = 'chesscoach:apiKey'
const ENV_KEY = (import.meta.env as Record<string, string | undefined>).VITE_ANTHROPIC_API_KEY ?? ''
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

/**
 * Owns the three user-controlled settings (difficulty, Coach, Explain) and orchestrates the
 * per-move flow: you (White) move -> chess.js validates -> opponent worker replies as Black.
 * With Coach on, a separate full-strength worker (MultiPV 3) highlights the best move and
 * scores your move's eval swing — fully offline. With Explain also on, an explicit request
 * fetches written reasoning from Claude, falling back silently to the offline coach on any
 * failure. Connectivity never auto-enables anything.
 */
export default function App() {
  const game = useChessGame()
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [thinking, setThinking] = useState(false)

  // --- Cursor / selection input (game controller, keyboard, tap) ---
  const [cursor, setCursor] = useState('e2')
  const [selected, setSelected] = useState<string | null>(null)
  const [keyboardActive, setKeyboardActive] = useState(false)

  // --- Opponent (Black) ---
  const opponentRef = useRef<Opponent | null>(null)
  // True if the engine can't start at all (so the bot can't move). Surfaced as a banner instead
  // of a silent hang — which is exactly the failure mode the missing-wasm bug used to produce.
  const [engineFailed, setEngineFailed] = useState(false)
  useEffect(() => {
    const opponent = new Opponent()
    opponentRef.current = opponent
    setEngineFailed(false)
    let active = true
    // whenReady() rejects if the worker never completes its handshake (blocked/missing engine).
    opponent.whenReady().catch(() => {
      if (active) setEngineFailed(true)
    })
    return () => {
      active = false
      opponentRef.current = null
      opponent.dispose()
    }
  }, [])

  // --- Coach (optional, offline) ---
  const [coachOn, setCoachOn] = useState(false)
  const [hint, setHint] = useState<CoachAnalysis | null>(null)
  const [swing, setSwing] = useState<SwingResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const coachRef = useRef<Coach | null>(null)
  const hintRef = useRef<CoachAnalysis | null>(null) // synchronous mirror of `hint`

  // --- Explain (optional, network) ---
  const [explainOn, setExplainOn] = useState(false)
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem(API_KEY_LS) ?? ENV_KEY
    } catch {
      return ENV_KEY
    }
  })
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState<string | null>(null)

  const saveApiKey = (key: string) => {
    setApiKey(key)
    try {
      localStorage.setItem(API_KEY_LS, key)
    } catch {
      /* persistence unavailable — key still held in memory for this session */
    }
  }

  // The explanation and any in-progress selection belong to a specific position; drop both
  // whenever the position changes (after your move or the bot's reply).
  useEffect(() => {
    setExplanation(null)
    setExplainError(null)
    setSelected(null)
  }, [game.fen])

  // Create the coach worker lazily the first time it's enabled; keep it for reuse.
  useEffect(() => {
    if (coachOn && !coachRef.current) coachRef.current = new Coach()
  }, [coachOn])
  // Dispose the coach worker on unmount.
  useEffect(
    () => () => {
      coachRef.current?.dispose()
      coachRef.current = null
    },
    [],
  )

  const isUsersTurn = game.status.turn === 'w' && !game.status.isGameOver

  // The bot (Black) replies whenever it's Black's turn and the game is still live.
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
        /* engine unavailable: leave it Black's turn rather than breaking the game */
      })
      .finally(() => {
        if (!cancelled) setThinking(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fen, game.status.turn, game.status.isGameOver, difficulty])

  // Coach analyzes the current position (for the best-move hint) when it's your turn.
  useEffect(() => {
    if (!coachOn || !isUsersTurn) {
      setHint(null)
      hintRef.current = null
      setAnalyzing(false)
      return
    }
    const coach = coachRef.current
    if (!coach) return

    let cancelled = false
    setAnalyzing(true)
    coach
      .analyze(game.fen)
      .then((analysis) => {
        if (cancelled) return
        setHint(analysis)
        hintRef.current = analysis
      })
      .catch(() => {
        /* coach unavailable: just no hint */
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachOn, isUsersTurn, game.fen])

  // After the user moves, compute the eval swing (how far from the engine's best move).
  async function evaluateUserMove(move: Move) {
    const coach = coachRef.current
    if (!coach) return
    const before = move.before
    const after = move.after
    const userUci = move.from + move.to + (move.promotion ?? '')

    // Reuse the just-shown hint if it analyzed this exact position; else analyze it now.
    const pre =
      hintRef.current && hintRef.current.fen === before ? hintRef.current : await coach.analyze(before)
    const best = pre.best
    if (!best) return

    const playedBest = sameMove(userUci, best.move)
    // If we didn't play the best move, evaluate the resulting position (opponent to move).
    const oppEvalAfterCp = playedBest ? null : ((await coach.analyze(after)).best?.scoreCp ?? null)

    setSwing(
      computeSwing({
        userSan: move.san,
        userUci,
        bestSan: uciToSan(before, best.move),
        bestUci: best.move,
        evalBeforeCp: best.scoreCp,
        oppEvalAfterCp,
      }),
    )
  }

  // Shared move-application path for every input method (drag, tap, controller, keyboard).
  const applyUserMove = (from: string, to: string): boolean => {
    if (!isUsersTurn) return false
    const move = game.move({ from, to })
    if (!move) return false
    setSelected(null)
    if (coachOn) void evaluateUserMove(move)
    return true
  }

  const handleMove = (from: string, to: string): boolean => applyUserMove(from, to)

  // Tap / A-button / Enter on a square: pick up your piece, then move it to a second square.
  const activateSquare = (square: string) => {
    if (!isUsersTurn) return
    const piece = game.game.get(square as Square)
    if (selected === null) {
      if (piece && piece.color === 'w') setSelected(square)
      return
    }
    if (square === selected) {
      setSelected(null) // tapped the selected piece again — deselect
      return
    }
    if (piece && piece.color === 'w') {
      setSelected(square) // tapped another of your own pieces — switch selection
      return
    }
    applyUserMove(selected, square) // chess.js judges legality; selection clears either way
    setSelected(null)
  }

  const handleCursorMove = (dir: Dir) => {
    setKeyboardActive(true)
    setCursor((c) => stepSquare(c, dir))
  }

  const cycleDifficulty = (delta: number) => {
    setDifficulty((d) => {
      const i = DIFFICULTIES.indexOf(d)
      return DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, Math.max(0, i + delta))]
    })
  }

  const handleCoachToggle = (on: boolean) => {
    setCoachOn(on)
    if (!on) {
      setHint(null)
      hintRef.current = null
      setSwing(null)
      setAnalyzing(false)
    }
  }

  const handleExplainToggle = (on: boolean) => {
    setExplainOn(on)
    if (!on) {
      setExplanation(null)
      setExplainError(null)
      setExplaining(false)
    }
  }

  // Explain only ever fires here — on an explicit user request, never automatically.
  const handleExplain = async () => {
    const analysis = hint ?? hintRef.current
    if (!analysis?.best) return

    // Cached positions are free and work offline.
    const cached = getCachedExplanation(analysis.fen)
    if (cached) {
      setExplanation(cached)
      setExplainError(null)
      return
    }
    if (!apiKey) {
      setExplainError('Add your Anthropic API key to use Explain.')
      return
    }

    setExplaining(true)
    setExplainError(null)
    try {
      const text = await explain(analysis, apiKey)
      setCachedExplanation(analysis.fen, text)
      setExplanation(text)
    } catch {
      // Silent fallback: the offline coach (best move + eval) stays; show a quiet note.
      setExplanation(null)
      setExplainError('Explanation unavailable — offline or API error. The offline coach still works.')
    } finally {
      setExplaining(false)
    }
  }

  const handleNewGame = () => {
    opponentRef.current?.newGame()
    coachRef.current?.newGame()
    setThinking(false)
    setHint(null)
    hintRef.current = null
    setSwing(null)
    setAnalyzing(false)
    setExplanation(null)
    setExplainError(null)
    setExplaining(false)
    setSelected(null)
    setCursor('e2')
    game.reset()
  }

  // Keyboard control: arrows move the cursor, Enter/Space select, Esc cancels. Subscribed once;
  // a ref keeps it acting on the latest state without re-subscribing on every render.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandlerRef.current = (e: KeyboardEvent) => {
    // Don't hijack typing in a field (e.g. the API-key input) or browser/OS shortcuts.
    const target = e.target as HTMLElement | null
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
    ) {
      return
    }
    switch (e.key) {
      case 'ArrowUp':
        handleCursorMove('up')
        break
      case 'ArrowDown':
        handleCursorMove('down')
        break
      case 'ArrowLeft':
        handleCursorMove('left')
        break
      case 'ArrowRight':
        handleCursorMove('right')
        break
      case 'Enter':
      case ' ':
        setKeyboardActive(true)
        activateSquare(cursor)
        break
      case 'Escape':
        setSelected(null)
        return
      default:
        return
    }
    e.preventDefault()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Game controller (Gamepad API) — same select-and-move scheme as keyboard and tap.
  const { connected: controllerConnected } = useGamepad({
    onMove: handleCursorMove,
    onConfirm: () => activateSquare(cursor),
    onCancel: () => setSelected(null),
    onCoach: () => handleCoachToggle(!coachOn),
    onNewGame: () => handleNewGame(),
    onDifficultyDown: () => cycleDifficulty(-1),
    onDifficultyUp: () => cycleDifficulty(1),
  })

  // Best-move arrow + square highlight (only while it's your turn and the coach has a hint).
  const hintBest = coachOn && isUsersTurn ? (hint?.best ?? null) : null
  const fromSq = hintBest?.move.slice(0, 2)
  const toSq = hintBest?.move.slice(2, 4)
  const coachArrows: Arrow[] =
    fromSq && toSq ? [{ startSquare: fromSq, endSquare: toSq, color: HINT_COLOR }] : []
  const coachSquares: Record<string, CSSProperties> =
    fromSq && toSq
      ? {
          [fromSq]: { boxShadow: `inset 0 0 0 4px ${HINT_COLOR}` },
          [toSq]: { boxShadow: `inset 0 0 0 4px ${HINT_COLOR}` },
        }
      : {}

  // Selection + cursor highlights for tap / controller / keyboard, layered over the coach's.
  const cursorVisible = controllerConnected || keyboardActive
  const inputSquares: Record<string, CSSProperties> = {}
  if (selected) {
    inputSquares[selected] = { background: 'rgba(255, 213, 79, 0.5)' }
    for (const m of game.game.moves({ square: selected as Square, verbose: true })) {
      inputSquares[m.to] = m.captured
        ? { background: 'radial-gradient(circle, transparent 56%, rgba(220, 38, 38, 0.5) 58%)' }
        : { background: 'radial-gradient(circle, rgba(0, 0, 0, 0.3) 18%, transparent 20%)' }
    }
  }
  if (cursorVisible) {
    inputSquares[cursor] = {
      ...(inputSquares[cursor] ?? {}),
      boxShadow: 'inset 0 0 0 3px rgba(255, 255, 255, 0.95)',
    }
  }
  const squareStyles: Record<string, CSSProperties> = { ...coachSquares, ...inputSquares }

  // The slower no-WebAssembly engine is in use when WASM can't compile (e.g. Lockdown Mode).
  const engineFallback = !isWasmSupported()

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

      <Controls
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        coachOn={coachOn}
        onCoachToggle={handleCoachToggle}
        explainOn={explainOn}
        onExplainToggle={handleExplainToggle}
      />

      {(engineFailed || engineFallback) && (
        <div
          className={`engine-banner engine-banner--${engineFailed ? 'error' : 'info'}`}
          role={engineFailed ? 'alert' : undefined}
        >
          {engineFailed
            ? 'The chess engine could not start, so the bot cannot move. Reload the page to try again. On an iPhone or iPad, if Lockdown Mode is on, allow this site (Settings → Privacy & Security → Lockdown Mode), then reload.'
            : 'Compatibility mode: WebAssembly is turned off in this browser (for example iOS Lockdown Mode), so the bot uses a slower built-in engine. It still plays — moves just take a little longer.'}
        </div>
      )}

      <Board
        fen={game.fen}
        onMove={handleMove}
        onSquareActivate={(sq) => {
          setCursor(sq)
          activateSquare(sq)
        }}
        allowDragging={isUsersTurn && !thinking}
        arrows={coachArrows}
        squareStyles={squareStyles}
      />

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

      {controllerConnected && (
        <div className="input-hint">
          🎮 D-pad move · A select · B cancel · Y coach · LB/RB difficulty · Start new game
        </div>
      )}

      <CoachPanel
        enabled={coachOn}
        analyzing={analyzing}
        hint={hint}
        swing={swing}
        explainEnabled={explainOn}
        hasApiKey={!!apiKey}
        onSaveApiKey={saveApiKey}
        onExplain={handleExplain}
        explaining={explaining}
        explanation={explanation}
        explainError={explainError}
      />

      <GameOverDialog status={game.status} onPlayAgain={handleNewGame} />
    </div>
  )
}
