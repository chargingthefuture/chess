# Agent instructions

Shared agent instructions for this repository, imported from `chargingthefuture/agents` so the
writing voice and banned-term dictionary stay the same across every repo. The voice, dictionary,
and process sections below are the portable core — keep them identical to the source. This repo's
own rules live in the **Project-specific rules** section at the bottom.

> Keep the wording below as-is. The voice and dictionary sections are the whole point of this
> standard; they are also what the enforcement hook checks. If you change a banned term here,
> change it in `.claude/hooks/check-no-pleasantries.mjs` too — the hook is the source of truth.

---

## Voice — no pleasantries, no feelings (Critical — every reply, all agents)

Do not address the user with thanks, apologies, congratulations, well-wishes, encouragement, or
closing sign-offs. Do not use first-person feeling words (for example: glad, happy, excited,
delighted, sorry, "hope this helps", "I appreciate"). You have no feelings; do not perform them.
No jargon, no buzzwords. State the result or the next step in plain words, then stop.

This is enforced by the Stop hook `.claude/hooks/check-no-pleasantries.mjs`, which blocks a reply
that contains a banned term and asks for a plain restatement.

### Banned-term dictionary (every reply, all agents)

The Stop hook `.claude/hooks/check-no-pleasantries.mjs` holds the canonical list and is the source
of truth; if this copy and the hook ever differ, the hook wins. Keep the two in sync — when you
change one, change the other. The hook scans the whole reply and matches the term even inside
quotes, so do not reach for a banned word even to talk about it; use the replacement below instead.

**Pleasantries, feelings, and sign-offs — never use any of these (in any reply):**

- thanks / thank you
- you're welcome / you are welcome
- no problem
- my pleasure
- glad
- happy to
- excited
- delighted
- sorry
- apology / apologies / apologize / apologise (any form)
- cheers
- congrats / congratulations
- "I appreciate" / "we appreciate" (only the first-person form is banned; "the rate appreciates" is fine)
- "hope this / hope that / hope you / hope it …"
- feel free
- warm / best / kind / kindest regards
- looking forward

**Excluded vocabulary — banned word → use instead:**

- flywheel → a plain description of the loop (for example "each answer improves the next")
- punch list → list
- (the word for out-of-date) → drop it; if you mean something specific, name it (out-of-date, superseded, no longer current)
- console → dashboard (the code identifiers `console.log` / `console.error` / `console.info` are exempt)

When the hook blocks a reply, restate the result in plain, factual language — none of the terms
above, no jargon, no first-person feeling words — then stop.

---

## Plain language — no jargon (Critical — all agents)

Write in plain, everyday language. **Do not use jargon, acronyms, or insider terminology** in
human-facing output — chat replies, pull-request titles and descriptions, review comments, commit
messages, issue comments, and documentation. Jargon is a distraction and is confusing; it slows the
reader down and hides meaning.

- **Default to simple words.** Prefer the plain term over the technical or marketing one (for example
  "test it before you rely on it" over "validate end-to-end"; "make sure" over "ensure idempotency";
  "the background service" over "the daemon"). Write so a non-specialist can follow.
- **If a technical term is genuinely necessary, define it in plain words on first use** — one short
  parenthetical is enough. Do not assume the reader knows acronyms; spell them out the first time.
- **Explain, don't just name.** Say what something does and why it matters, not only its label.
- **Exempt:** real code identifiers, file paths, command names, and established proper nouns (service
  names, library names) — name those accurately; just don't pile extra jargon around them.
- Applies to **every agent** and all human-facing communication. When in doubt, choose the wording a
  newcomer would understand.

---

## Task planning — no "phases" (Critical)

Do **not** organize work into "phases." No "Phase 0 / Phase 1 / Phase 2", no phased-rollout buckets —
anywhere: plans, checklists, design notes, code comments, pull-request descriptions, or commit
messages. Phases confuse humans and agents alike.

Instead, when given an objective, break it into discrete tasks and **list them one after another in
the order they must happen**. Where order matters, state it as an explicit blocking dependency, not a
phase:

- ✅ "Task B is blocked by Task A — do A first."
- ✅ A flat, ordered, numbered task list (1, 2, 3 …) where each item may name what it depends on.
- ❌ "Phase 1: …", "Phase 2: …", "do this in a later phase."

A task with no dependency can be done at any time or in parallel; say so plainly ("no dependencies;
can run anytime").

---

## Branch naming (all agents)

- Always create a descriptive, task-named branch and develop on it. Use a Conventional-Commit-style
  prefix plus a short kebab-case summary of the task: for example `feat/user-auth-refresh`,
  `fix/csv-export-dedup`, `chore/ci-node-version-bump`, `docs/readme-quickstart`.
- Never develop on, commit to, or open a pull request from an auto-generated session branch (an opaque
  name like `claude/loving-mendel-wwWF4`). Treat it as a throwaway base: immediately branch off it (or
  off the default branch) to a descriptive name and push from the descriptive branch.
- Branch names must describe the task at hand — never an opaque or random string.

---

## Search tooling (optional convenience)

- Prefer `rg` (ripgrep) for recursive text and file discovery.
- Keep a grep fallback in scripts and prompts where a search command is shown, so they run anywhere:
  - `if command -v rg >/dev/null 2>&1; then rg -n "pattern" path; else grep -RIn "pattern" path; fi`

---

## Project-specific rules — chess PWA

This repository is an offline-first single-player chess progressive web app (a website that installs
to the home screen and runs offline): Vite + React + TypeScript, with a Stockfish bot and optional
coaching. The voice, plain-language, no-"phases", and branch-naming sections above apply unchanged.
Add the following repo-specific constraints.

### Stack and build

- Vite + React + TypeScript; the installable-offline behavior comes from `vite-plugin-pwa`.
- Build with `npm run build` (it runs `tsc -b` then `vite build`). There is no separate test runner —
  keep the build green. The dev server does not type-check, so run `npm run build` before pushing.

### Engine (the parts that are easy to break)

- Use the Stockfish **lite-single** WASM build only — single-threaded, about 7 MB, and it needs no
  special cross-origin isolation headers. Do not switch to the large multi-threaded build.
- The worker derives its binary's name from its **own** filename: loaded as
  `<worker-directory>/stockfish-18-lite-single.js`, it fetches
  `<worker-directory>/stockfish-18-lite-single.wasm`. So the WASM must keep that exact name next to
  the worker — do **not** rename it. (An earlier version renamed it to `stockfish.wasm`; that made
  the fetch 404, the engine never started, and the bot never moved.) `scripts/copy-engine.mjs`
  refreshes both files from `node_modules`. Keep them committed so the build and offline play work
  without a network fetch.
- A pure-JavaScript fallback engine, `public/engine/stockfish-18-asm.js`, runs where WebAssembly is
  blocked (for example iOS Lockdown Mode). It is self-contained (no separate binary). Pick the build
  at runtime in `src/engine/engineUrl.ts` (`isWasmSupported()`); never assume WebAssembly exists.
- Run **two separate** Stockfish workers — one opponent (skill-limited) and one coach (full
  strength). Never change options on a worker, or start a new search on it, while it is still
  searching — that is misuse and the engine hangs. `src/engine/uciWorker.ts` serializes every command
  through a queue; route all engine input through it.
- The offline service worker must keep the WASM cached: keep its per-file size limit above the WASM
  size and keep `wasm` in the cache file-match patterns.

### Rules and board

- `chess.js` is the only authority on whether a move is legal. The board proposes a move; chess.js
  decides (its `move()` throws on an illegal move — treat that as "rejected"). Never decide legality
  in the user interface.
- `react-chessboard` is version 5 or newer: pass a single `options` object to the board. Do not use
  the older separate `position` / `onPieceDrop` props.
- A FEN string (the standard one-line text for a chess position) is the contract between chess.js, the
  board, and Stockfish — pass FEN between layers, not bespoke state.

### Coaching

- Coach is offline only — no network. Explain is network plus an explicit opt-in: it calls the
  Anthropic API directly from the browser using the user's own key, which exposes that key. That is
  acceptable only for this personal, single-user app, and is flagged in `src/coaching/explain.ts`.
  Do not copy that pattern anywhere a key would be shared. When editing Anthropic calls, use the
  current model id and request shape.
- Explain must fail safe: on any network or API error, fall back without comment to the offline coach
  (best move and evaluation still shown) — never throw, never block the game.

### Checking work without a browser

- No headless browser is available in this environment. Check engine-facing logic against the real
  engine in Node (the lite-single build also runs under Node) and with `npm run build`.
