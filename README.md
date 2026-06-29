# Chess Coach — offline-first PWA

A single-player chess web app (installable PWA) where you play **White** against a
**Stockfish** bot at Easy / Medium / Hard, with two optional, independently-toggleable
training features layered on top:

- **Coach** *(offline)* — a second, full-strength engine highlights the best move and tells
  you the eval swing of the move you just played. No network.
- **Explain** *(network, opt-in)* — sends the position and the coach's top moves to Claude,
  which writes the human "why." Only fires when you turn it on **and** ask for it.

Everything except Explain works **fully offline**, and the whole thing installs to your phone's
home screen.

## Features

- Play Stockfish at **Easy / Medium / Hard** (Skill Level + search depth).
- **Installable PWA** — works offline once cached, including the ~7 MB engine.
- **Coach** — best-move arrow + square highlight + live eval, and per-move feedback
  classified as Solid / Inaccuracy / Mistake / Blunder with the centipawn loss.
- **Explain** — 2–4 sentences of coaching prose from Claude, cached per position so a
  reviewed game becomes an offline study set.
- Checkmate / stalemate / draw detection → **Play again**.

## Controls

Move a piece any of these ways — all four feed the same select-and-move logic, and
drag-and-drop keeps working exactly as before:

- **Drag and drop** — drag a piece to its square (mouse or touch).
- **Tap to move** — tap your piece (legal targets light up), then tap the destination.
- **Keyboard** — arrow keys move a square cursor, **Enter/Space** select, **Esc** cancels.
- **Game controller** — pair a Bluetooth controller (works in desktop Chrome/Edge/Firefox,
  Android Chrome, and iOS/iPadOS Safari 16+). **D-pad / left stick** moves the cursor;
  **A** select/move · **B** cancel · **Y** toggle Coach · **LB/RB** difficulty · **Start** new game.

Pawn promotion is automatic (queen).

## Tech stack

- **Vite + React + TypeScript**
- **`vite-plugin-pwa`** — manifest + service worker (precaches the WASM for offline play)
- **`chess.js`** — the single source of truth for legality (FEN/PGN, check/mate/draw)
- **`react-chessboard` v5** — board UI (drag/drop, custom square styles, arrows)
- **`stockfish` (lite-single WASM)** — the bot and the coach, run in Web Workers over UCI

## Architecture

**FEN strings are the contract between every layer.** chess.js, react-chessboard, and
Stockfish all speak FEN, so each layer only reads or emits a FEN string and they stay
decoupled and individually testable.

Per-move flow:

```
drag piece → board fires drop callback → ask chess.js if legal (move object or null)
→ if legal, apply + re-render → hand new FEN to the opponent worker
→ worker returns a move → chess.js applies it → re-render → check for game over
```

Key decisions:

- **chess.js alone decides legality.** The UI proposes; chess.js validates (its `move()`
  throws on an illegal move, which we treat as "rejected").
- **Two separate Stockfish workers, never one reconfigured.** One skill-limited *opponent*
  worker and one full-strength *coach* worker (MultiPV 3). They're isolated so neither is
  ever reconfigured or interrupted mid-search.
- **The UCI wrapper serializes commands.** `UciEngine` runs every `init`/`setOptions`/
  `newGame`/`search` through an internal queue, so changing options or starting a search
  while the engine is mid-search (UCI misuse that hangs the engine) is structurally
  impossible.
- **lite-single flavor.** Single-threaded, ~7 MB, needs **no** special
  `Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy` headers — far simpler to
  host as a PWA, and still far stronger than any human.

### The Stockfish worker + WASM

The lite-single worker derives its binary's name from its **own** filename: loaded as
`<dir>/stockfish-18-lite-single.js`, it fetches `<dir>/stockfish-18-lite-single.wasm`. So the
wasm must keep that exact name next to the worker — renaming it makes the fetch return
"not found", the engine never starts, and the bot never moves. The engine is vendored under
`public/engine/` as:

- `stockfish-18-lite-single.js` (the worker) + `stockfish-18-lite-single.wasm` (its binary)
- `stockfish-18-asm.js` — a self-contained pure-JavaScript engine (no WebAssembly), used as a
  fallback when WebAssembly is blocked (for example iOS Lockdown Mode). It needs no extra file.

These files are committed so the repo is self-contained and builds/plays offline.
`scripts/copy-engine.mjs` (run automatically before `dev`/`build`) refreshes them from
`node_modules/stockfish/bin` when present, and is tolerant of a missing source.

## Getting started

```bash
npm install        # also fetches the Stockfish engine via its postinstall
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Requires Node 18+.

### Install to your phone

1. `npm run build` and serve `dist/` over HTTPS (any static host), or `npm run preview` on
   your LAN.
2. Open it in mobile Safari/Chrome → **Add to Home Screen**.
3. Launch from the home screen — after the first load it plays fully offline.

## The Explain feature (optional, network)

Explain calls the **Anthropic Messages API directly from the browser** using **your own API
key**. There is no backend.

- Toggle **Coach** on, then **Explain** on, then press **Explain this position**.
- The first time, paste your Anthropic API key — it's stored in `localStorage` on that
  device only. (You can also bake it in at build time via a `VITE_ANTHROPIC_API_KEY`
  environment variable.)
- Explanations are cached per position, so re-asking is free and works offline.

> ⚠️ **Security note.** Calling Anthropic from browser JS requires the
> `anthropic-dangerous-direct-browser-access` header and **exposes the key in the client**.
> That trade-off is acceptable for this *personal, single-user, on-device* app, and is
> flagged in a comment in `src/coaching/explain.ts`. **Do not** ship this pattern in a
> multi-user product — put the key behind your own backend instead.

The model is `claude-opus-4-8` (set in `src/coaching/explain.ts`); switch the one constant to
`claude-haiku-4-5` for cheaper/faster hints. **Failure handling:** if Explain is on but the
call fails or there's no network, it silently falls back to the Coach-on/Explain-off state
(move still highlighted, eval still shown, no prose) — it never throws and never blocks the
game.

## Project structure

```
src/
  App.tsx                  # layout; owns difficulty + Coach/Explain toggles; orchestration
  components/
    Board.tsx              # react-chessboard v5 wrapper (drag handling, arrows, highlights)
    Controls.tsx           # difficulty selector + Coach/Explain toggles
    GameOverDialog.tsx     # checkmate/draw → "Play again"
    CoachPanel.tsx         # best move + eval swing + Explain UI
  hooks/
    useChessGame.ts        # holds the Chess() instance; exposes move/reset/status
  engine/
    uciWorker.ts           # generic UCI worker wrapper, Promise-on-bestmove, serialized
    opponent.ts            # skill-limited engine; difficulty → UCI options
    coach.ts               # full-strength engine, MultiPV 3; parse + eval-swing helpers
  coaching/
    explain.ts             # Anthropic call: (fen, top moves, evals) → prose
    explainCache.ts        # FEN-keyed cache (localStorage) so a position is never re-explained
scripts/
  copy-engine.mjs          # vendors the lite-single worker + wasm into public/engine/
  gen-icons.mjs            # dependency-free PWA icon generator
```

## Difficulty mapping

| Level  | Skill Level | Search        |
|--------|-------------|---------------|
| Easy   | 2           | `go depth 5`  |
| Medium | 8           | `go depth 10` |
| Hard   | 20          | `go depth 14` |

The coach always runs at full strength with `MultiPV 3`.

## How it was verified

No headless browser is available in CI here, so the engine-facing logic is verified against
the **real engine** in Node (the lite-single build also runs under Node), plus production
build checks:

- `UciEngine` drives the real engine over an injected transport: handshake, search,
  MultiPV-3 parsing, and command serialization.
- The coach's parsing and **eval-swing math** are checked against the engine — playing the
  best move yields ~0 loss; a blunder yields a large positive loss.
- The Explain request shape (headers, model, no Opus-rejected params, FEN+SAN prompt), error
  handling, and FEN-keyed cache are unit-tested with a mocked `fetch`.
- `npm run build` runs `tsc` + the PWA plugin and confirms the WASM is precached.

## Deploy (GitHub Pages)

This repo deploys to a GitHub Pages project site at `https://chargingthefuture.github.io/chess/`,
which serves from the `/chess/` sub-path (not the domain root). Two things make that work:

- `vite.config.ts` sets `base: '/chess/'`, so every built asset URL (JS, CSS, the engine worker +
  wasm, the manifest, the service worker) is prefixed with `/chess/`. Without it the page loads
  blank because the assets 404. If you fork this under a different repo name, change that one
  constant to `/<your-repo>/`.
- `.github/workflows/deploy.yml` builds the app and publishes `dist/` on every push to `main`.

One-time setup: in the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**
(the workflow also tries to enable this automatically). After that, each push to `main` publishes
the site.

## License

The bundled Stockfish engine is GPL-3.0 (see `public/engine/`). Application code in this repo
is provided as-is for personal use.
