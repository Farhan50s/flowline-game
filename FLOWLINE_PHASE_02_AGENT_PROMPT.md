# FLOWLINE — PHASE 2: PURE PUZZLE RULES AND STATE ENGINE

You are a senior TypeScript game-engine engineer and test engineer working in the existing FLOWLINE project at `D:\PROJECTS\flowline-game`.

**Goal:** Build a correct, deterministic, thoroughly tested arrow-extraction rules engine on top of the verified Phase 1 project. This is **Phase 2 only**. Do not move into level generation, graphics animation, sound, or Android packaging work.

## 1. Preflight and preserve the existing work

1. Inspect `git status`, existing source files, `src/game/types.ts`, `src/graphics/*`, `src/main.ts`, settings persistence, package scripts, and existing tests. Report any uncommitted files; do not overwrite unrelated changes.
2. Read `FLOWLINE_ONE_DAY_GAME_BLUEPRINT.md` in the project root. If absent, say so; proceed from this prompt rather than inventing requirements. This Phase 2 prompt controls the scope if there is a disagreement.
3. Keep vanilla TypeScript, Vite, Vitest, Canvas 2D, and Capacitor 8; do not introduce React, Phaser, third-party collision engines, runtime backend APIs, new SDKs, or unnecessary dependencies.
4. Keep Phase 1 preview artwork explicitly separate from playable `Level` data. Maintain its existing layout, controls, responsive behavior, and settings.

## 2. Domain model and geometry invariants

Use/update the current browser-independent contracts with minimal disruption:
- `GridPoint`: integer x/y coordinates.
- `Direction`: cardinal up/right/down/left.
- `ArrowPath`: unique ID, **tail-to-head** ordered cells, cardinal head direction.
- `Level`: positive integer board width/height, unique arrow IDs, arrows, existing metadata.
- `GameState`: level, active arrow IDs, mode, hearts, attempts/moves, mistakes, game phase, and an optional `pendingArrowId` when extraction is in progress.

Build pure functions for geometry validation, occupancy, exit-lane tracing, and legal move detection. Validate level objects at load:
- Board dimensions are positive integers within sensible safe bounds.
- Each arrow contains >= 2 cells; all coordinates are integers and in bounds.
- Consecutive cells are exactly one orthogonal grid step apart (no diagonals or gaps).
- No repeated cell within one arrow, overlapping cells between arrows, or duplicate arrow IDs.
- The final segment (penultimate cell -> head cell) matches the declared head direction.
- Disallow a path whose forward head ray hits an earlier cell of *that same arrow*. That pathological geometry would make an extraction visually ambiguous.
- Invalid levels return a clear, actionable error or validation result; do not silently repair their geometry.

## 3. Exact collision rule

For an active arrow, identify its HEAD as its last cell and step one cell at a time along its head's outward direction until exiting the board.
- The move is **safe** only if none of those cells belongs to *any other active arrow*.
- If blocked, return the **first blocker in distance order** from the head, not an arbitrary occupant elsewhere in the board.
- An arrow anywhere else must not affect the decision.
- A ray with zero in-board cells (head already at outward board boundary) is safe.
- Removed arrows must no longer occupy cells or block later attempts.
- Do not use simplistic head-adjacency checks or rigid-translation collision checks for bent arrows.

Implement readable, tested, side-effect-free functions such as `validateLevel`, `buildOccupancy`, `firstBlocker`, and `getSafeArrowIds` (names may match repo style).

## 4. State transition rules

Implement deterministic, pure state transitions, such as:
- `createGameState(level, mode)` — create an independent state. Challenge starts with 3 hearts. Zen does not deduct hearts.
- `attemptMove(state, arrowId)` — one attempt; return discriminated feedback of `exiting`, `blocked`, or `ignored` along with next state and blocker ID when relevant.
- On safe attempt, mark phase `animating` and `pendingArrowId`; **do not remove the arrow yet**. Future animation code will call `completeEscape(state)` after the animation finishes.
- `completeEscape(state)` — remove only the expected pending arrow, then set phase to `ready` or `won` if the board is empty; clear pending ID. Calls without a pending escape must be safely ignored or rejected with a documented contract.
- On blocked attempt, keep the board unchanged, increment `mistakes`, and deduct exactly one heart **only in Challenge**. If Challenge hearts reach zero, set phase `lost`. Zen continues.
- For metrics, `moves` counts actual attempts against a current arrow (both blocked and successful); ignored taps are not counted.
- Unknown/removed arrow IDs and taps during animation, `won`, or `lost` are ignored with **no** heart/move penalty.
- `restartLevel(state)` recreates the same level and mode, 3 Challenge hearts, all arrows restored, cleared counters and pending state, without mutating the original state or regenerating a seed.
- `getSafeArrowIds(state)` can power Phase 5 hints; Phase 2 implements only the pure selector, not UI hints.
- No timers, visual effects, canvas APIs, DOM imports, localStorage access, sounds, or network requests inside game rules/state.

State changes must not mutate incoming objects, arrays, or `Set` instances. Keep replay behavior deterministic.

## 5. Automated tests (critical)

Write meaningful Vitest tests covering at least the following:
1. A straight arrow facing an open edge is safe.
2. A blocker several cells away still blocks.
3. The nearest of multiple blockers is returned.
4. An unrelated arrow in another row/column does not block.
5. A bent arrow uses its **head exit ray**, not its previous body segments or bounding box.
6. The last cell on an outward edge is safe.
7. Removing a blocker unlocks a formerly blocked arrow.
8. Invalid overlap, self-intersection, diagonal step, gap, out-of-bounds point, duplicate ID, and mismatched head direction are rejected.
9. Invalid self-head-ray geometry is rejected.
10. Challenge blocked move costs one heart and one mistake; Zen blocked move costs no heart.
11. Safe move enters animating but keeps the arrow active until completion.
12. Completing escape removes exactly that arrow and detects final victory.
13. Unknown/removed IDs and actions in animating/won/lost states do nothing.
14. Exactly three blocked Challenge attempts produce loss; further attempts do nothing.
15. Restart returns the same puzzle with counters/hearts reset and no mutation.
16. `getSafeArrowIds` matches actual collision results for fixed boards.
17. No state transition mutates input level, arrays, or Sets.
18. Existing Phase 1 tests still pass.

Use carefully hand-authored **original** test fixtures with valid arrow geometry and explicit expected results. Avoid random flaky tests, false passing expectations, or tests that simply repeat the implementation algorithm.

## 6. Scope limits

Do not implement Phase 3's seeded generator, solver, difficulty scoring, or hundreds of puzzle levels. Do not implement Phase 4's escape animation or interactive gameplay canvas. Do not invent that preview artwork is a playable board. No new monetization, backend, accounts, native permissions, or audio dependencies.

Keep changes focused, with clear source boundaries (`src/game/rules.ts`, `src/game/state.ts`, related types and tests). If a small test-only sample level is useful, ensure it's clearly labelled as a fixture, not official game content.

## 7. Verification and handoff

Actually run:
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run android:sync` (only if the previous commands pass; native APK build is NOT required in Phase 2)

If browser inspection tools are available, ensure the existing Home and Board Preview screens still work, and there are no new console errors. Do not claim native build or device testing: the current machine lacks a compatible JDK and Android SDK until separately fixed.

Write `docs/PHASE_02_HANDOFF.md` with:
- Exact files changed and important API signatures
- Formal collision/first-blocker semantics and transition contract
- Actual number of tests and command exit statuses
- Any assumptions/limitations and preview UI regression results
- Phase 3 readiness and any blockers

Do the implementation, fix failures, and stop. **Do not start Phase 3, commit/push, or deploy without permission.**
