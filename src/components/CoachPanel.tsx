import { uciToSan } from '../engine/coach'
import type { CoachAnalysis, CoachLine, SwingResult } from '../engine/coach'

/** Format a line's eval from the side-to-move's perspective: "+0.74", "-1.20", or "#3". */
function formatEval(line: CoachLine): string {
  if (line.mate !== null) return `#${line.mate}`
  const pawns = (line.scoreCp / 100).toFixed(2)
  return line.scoreCp > 0 ? `+${pawns}` : pawns
}

type Tone = 'good' | 'inaccuracy' | 'mistake' | 'blunder'

function classify(lossCp: number): { label: string; tone: Tone } {
  if (lossCp < 40) return { label: 'Solid', tone: 'good' }
  if (lossCp < 90) return { label: 'Inaccuracy', tone: 'inaccuracy' }
  if (lossCp < 180) return { label: 'Mistake', tone: 'mistake' }
  return { label: 'Blunder', tone: 'blunder' }
}

export interface CoachPanelProps {
  enabled: boolean
  analyzing: boolean
  /** Analysis of the current position (user to move) — drives the best-move suggestion. */
  hint: CoachAnalysis | null
  /** Feedback on the user's most recent move. */
  swing: SwingResult | null
}

/**
 * Offline coaching panel: the engine's best move + eval for the current position, plus
 * feedback (eval swing) on the user's last move. No network — purely the local coach worker.
 * The board itself shows the best-move arrow/highlight (driven from App).
 */
export function CoachPanel({ enabled, analyzing, hint, swing }: CoachPanelProps) {
  if (!enabled) return null

  const best = hint?.best ?? null
  const bestSan = best && hint ? uciToSan(hint.fen, best.move) : null

  return (
    <div className="coach">
      <div className="coach__head">
        <span className="coach__title">Coach</span>
        {analyzing && <span className="coach__analyzing">analyzing…</span>}
      </div>

      <div className="coach__row">
        <span className="coach__key">Best move</span>
        <span className="coach__val">
          {bestSan && best ? (
            <>
              {bestSan} <span className="coach__eval">{formatEval(best)}</span>
            </>
          ) : analyzing ? (
            '…'
          ) : (
            '—'
          )}
        </span>
      </div>

      {swing &&
        (swing.playedBest ? (
          <div className="coach__feedback tone-good">
            ✓ <strong>{swing.userSan}</strong> was the top move.
          </div>
        ) : (
          <div className={`coach__feedback tone-${classify(swing.lossCp).tone}`}>
            <strong>{swing.userSan}</strong> — {classify(swing.lossCp).label}
            {swing.lossCp <= 2000 && <> (−{(swing.lossCp / 100).toFixed(1)})</>}. Engine preferred{' '}
            <strong>{swing.bestSan}</strong>.
          </div>
        ))}
    </div>
  )
}
