export type Dir = 'up' | 'down' | 'left' | 'right'

/**
 * Move a board cursor one square in a direction, clamped to the board edges.
 * Coordinates assume White's orientation (rank 1 at the bottom): "up" increases the rank.
 * Pure and side-effect free so it can be unit-tested without a DOM.
 */
export function stepSquare(square: string, dir: Dir): string {
  let file = square.charCodeAt(0) - 97 // 'a' -> 0
  let rank = square.charCodeAt(1) - 49 // '1' -> 0
  if (dir === 'up') rank = Math.min(7, rank + 1)
  else if (dir === 'down') rank = Math.max(0, rank - 1)
  else if (dir === 'left') file = Math.max(0, file - 1)
  else if (dir === 'right') file = Math.min(7, file + 1)
  return String.fromCharCode(97 + file) + String.fromCharCode(49 + rank)
}
