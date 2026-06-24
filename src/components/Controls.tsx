import type { Difficulty } from '../engine/opponent'

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

interface ToggleProps {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

/** A labelled on/off switch (used for Coach and, later, Explain). */
function Toggle({ label, hint, checked, disabled, onChange }: ToggleProps) {
  return (
    <label className={`toggle ${disabled ? 'is-disabled' : ''}`}>
      <span className="toggle__text">
        <span className="control-row__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="toggle__input"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </label>
  )
}

export interface ControlsProps {
  difficulty: Difficulty
  onDifficultyChange: (d: Difficulty) => void
  coachOn: boolean
  onCoachToggle: (on: boolean) => void
}

/**
 * Difficulty selector + the Coach toggle. (Increment 5 adds the Explain toggle here.)
 * Coach is never auto-enabled — it's an explicit user choice.
 */
export function Controls({ difficulty, onDifficultyChange, coachOn, onCoachToggle }: ControlsProps) {
  return (
    <div className="controls">
      <div className="control-row">
        <span className="control-row__label">Difficulty</span>
        <div className="segmented" role="group" aria-label="Difficulty">
          {LEVELS.map((lvl) => (
            <button
              key={lvl.value}
              type="button"
              className={`segmented__btn ${difficulty === lvl.value ? 'is-active' : ''}`}
              aria-pressed={difficulty === lvl.value}
              onClick={() => onDifficultyChange(lvl.value)}
            >
              {lvl.label}
            </button>
          ))}
        </div>
      </div>

      <Toggle
        label="Coach"
        hint="Best move + eval, fully offline"
        checked={coachOn}
        onChange={onCoachToggle}
      />
    </div>
  )
}
