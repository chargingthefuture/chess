import type { Difficulty } from '../engine/opponent'

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

export interface ControlsProps {
  difficulty: Difficulty
  onDifficultyChange: (d: Difficulty) => void
}

/**
 * Difficulty selector. Increments 4 and 5 add the Coach and Explain toggles here.
 */
export function Controls({ difficulty, onDifficultyChange }: ControlsProps) {
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
    </div>
  )
}
