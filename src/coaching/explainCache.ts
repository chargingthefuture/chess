/**
 * FEN-keyed cache of explanations, persisted to localStorage. The same position asked
 * twice never re-calls the API — turning a reviewed game into an offline study set, and
 * keeping costs down.
 *
 * Keyed on the position fields only (piece placement, side to move, castling, en passant),
 * dropping the half/full-move counters so the "same position" matches regardless of move
 * number or transposition order.
 */

const MEMORY = new Map<string, string>()
const LS_PREFIX = 'chesscoach:explain:'

function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

export function getCachedExplanation(fen: string): string | null {
  const key = positionKey(fen)
  const inMemory = MEMORY.get(key)
  if (inMemory !== undefined) return inMemory
  try {
    const stored = localStorage.getItem(LS_PREFIX + key)
    if (stored !== null) {
      MEMORY.set(key, stored)
      return stored
    }
  } catch {
    /* localStorage unavailable (private mode / disabled) — in-memory only */
  }
  return null
}

export function setCachedExplanation(fen: string, text: string): void {
  const key = positionKey(fen)
  MEMORY.set(key, text)
  try {
    localStorage.setItem(LS_PREFIX + key, text)
  } catch {
    /* quota exceeded or unavailable — the in-memory cache still serves this session */
  }
}
