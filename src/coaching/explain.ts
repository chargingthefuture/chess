import type { CoachAnalysis } from '../engine/coach'
import { formatEval, uciToSan } from '../engine/coach'

/**
 * Explain: optional, network-only coaching prose from Claude.
 *
 * ⚠️ SECURITY: This calls the Anthropic API directly from the browser with the user's own
 * API key, which requires the `anthropic-dangerous-direct-browser-access` header and
 * therefore EXPOSES THE KEY in the client. That is acceptable ONLY for this personal,
 * single-user, on-device app (per the product spec). Never ship this pattern in a
 * multi-user product — put the key behind your own backend instead.
 */

const API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Default model. Opus 4.8 is the most capable; for cheaper/faster hints on your own key,
// change this one line to 'claude-haiku-4-5'.
const MODEL = 'claude-opus-4-8'

const SYSTEM_PROMPT =
  'You are a concise, encouraging chess coach. Given a position and the engine\'s top ' +
  'candidate moves with evaluations, explain in 2 to 4 sentences of plain prose why the ' +
  'best move is strong and what makes the main alternatives weaker. Reference concrete ' +
  'ideas — threats, piece activity, king safety, the center, pawn structure. Do not use ' +
  'markdown, headings, or lists. Respond with only the explanation text.'

export class ExplainError extends Error {}

/** Build the LLM prompt from a coach analysis: FEN + top-3 moves (SAN) + centipawn evals. */
function buildUserPrompt(analysis: CoachAnalysis): string {
  const sideToMove = analysis.fen.split(' ')[1] === 'b' ? 'Black' : 'White'
  const moves = analysis.lines
    .slice(0, 3)
    .map((line, i) => `${i + 1}. ${uciToSan(analysis.fen, line.move)} (eval ${formatEval(line)})`)
    .join('\n')
  const best = analysis.best ? uciToSan(analysis.fen, analysis.best.move) : 'the top move'
  return [
    `Position (FEN): ${analysis.fen}`,
    `${sideToMove} to move. Evaluations are in pawns from ${sideToMove}'s perspective (higher is better for ${sideToMove}; "#n" means mate in n).`,
    `Engine's top moves, best first:`,
    moves,
    `Explain why ${best} is best and what is less good about the alternatives.`,
  ].join('\n')
}

/**
 * Request a prose explanation for a coach analysis. Throws ExplainError on any network/API
 * failure so the caller can fall back to the silent Coach-only state.
 */
export async function explain(
  analysis: CoachAnalysis,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // Required for direct browser calls — and an explicit acknowledgement that the key
      // is exposed to the client. See the security note at the top of this file.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      // No temperature / top_p / thinking: those are rejected by Opus 4.x and unneeded here.
      messages: [{ role: 'user', content: buildUserPrompt(analysis) }],
    }),
    signal,
  })

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = `: ${body.error.message}`
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ExplainError(`Anthropic API ${res.status}${detail}`)
  }

  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> }
  const text = data.content?.find((b) => b?.type === 'text')?.text
  if (typeof text !== 'string' || !text.trim()) {
    throw new ExplainError('Unexpected API response (no text content)')
  }
  return text.trim()
}
