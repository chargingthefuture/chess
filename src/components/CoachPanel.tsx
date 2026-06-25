import { useState } from 'react'
import { formatEval, uciToSan } from '../engine/coach'
import type { CoachAnalysis, SwingResult } from '../engine/coach'

type Tone = 'good' | 'inaccuracy' | 'mistake' | 'blunder'

function classify(lossCp: number): { label: string; tone: Tone } {
  if (lossCp < 40) return { label: 'Solid', tone: 'good' }
  if (lossCp < 90) return { label: 'Inaccuracy', tone: 'inaccuracy' }
  if (lossCp < 180) return { label: 'Mistake', tone: 'mistake' }
  return { label: 'Blunder', tone: 'blunder' }
}

/** Inline form to capture the user's Anthropic API key (stored locally by the caller). */
function ApiKeyForm({ onSave }: { onSave: (key: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="coach__keyform"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSave(value.trim())
      }}
    >
      <label className="coach__keylabel" htmlFor="anthropic-key">
        Anthropic API key (stored on this device only)
      </label>
      <div className="coach__keyrow">
        <input
          id="anthropic-key"
          type="password"
          className="coach__keyinput"
          placeholder="sk-ant-…"
          value={value}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn--primary" disabled={!value.trim()}>
          Save
        </button>
      </div>
    </form>
  )
}

export interface CoachPanelProps {
  enabled: boolean
  analyzing: boolean
  /** Analysis of the current position (user to move) — drives the best-move suggestion. */
  hint: CoachAnalysis | null
  /** Feedback on the user's most recent move. */
  swing: SwingResult | null
  // --- Explain (network) ---
  explainEnabled: boolean
  hasApiKey: boolean
  onSaveApiKey: (key: string) => void
  onExplain: () => void
  explaining: boolean
  explanation: string | null
  explainError: string | null
}

/**
 * Offline coaching panel: the engine's best move + eval for the current position, plus
 * feedback (eval swing) on the user's last move. The board shows the best-move arrow.
 * When Explain is enabled, an opt-in button fetches written reasoning from Claude;
 * failures fall back silently to the offline coach state.
 */
export function CoachPanel({
  enabled,
  analyzing,
  hint,
  swing,
  explainEnabled,
  hasApiKey,
  onSaveApiKey,
  onExplain,
  explaining,
  explanation,
  explainError,
}: CoachPanelProps) {
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

      {explainEnabled &&
        (!hasApiKey ? (
          <ApiKeyForm onSave={onSaveApiKey} />
        ) : (
          <div className="coach__explain">
            <button
              type="button"
              className="btn--primary coach__explain-btn"
              onClick={onExplain}
              disabled={explaining || !best}
            >
              {explaining ? 'Asking the coach…' : 'Explain this position'}
            </button>
            {explanation && <p className="coach__explanation">{explanation}</p>}
            {explainError && !explanation && <p className="coach__explain-note">{explainError}</p>}
          </div>
        ))}
    </div>
  )
}
