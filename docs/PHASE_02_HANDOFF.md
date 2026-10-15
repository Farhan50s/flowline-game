# FLOWLINE — Phase 02 handoff

Date: 14 October 2026 (Asia/Karachi)

## Delivered scope

Implemented browser-independent validation, occupancy, head-lane collision rules, safe-arrow selection, and immutable state transitions for Challenge and Zen. No gameplay UI, animation, generator, solver, difficulty scoring, sound, or new dependencies were added.

The blueprint, Phase 2 prompt, and Phase 1 handoff were read. The Phase 2 prompt controls this phase, including deferred removal through `completeEscape`. The supplied specifications are now present; Phase 1's historical note that the blueprint was absent remains unchanged.

## Exact files changed or added

| File | Change |
| --- | --- |
| `src/game/types.ts` | Updated playable Level and GameState contracts, Challenge/Zen modes, and ready/animating/won/lost phases. |
| `src/game/rules.ts` | Added runtime level validation, structured errors, bounded exit tracing, active occupancy, first-blocker rules, and safe-arrow selector. |
| `src/game/state.ts` | Added initialization, discriminated move feedback, deferred completion, and restart. |
| `src/tests/fixtures/puzzles.ts` | Added original, hand-authored test-only straight/bent boards and invalid self-ray geometry. |
| `src/tests/rules.test.ts` | Added malformed-load, geometry, direction, occupancy, first-blocker, bent-path, and deadlock-selector tests. |
| `src/tests/state.test.ts` | Added modes, counters, animation gating, completion, restart, immutability, and replay tests. |
| `docs/PHASE_02_HANDOFF.md` | This handoff. |
| `docs/verification/phase02-ui-regression.jpg` | Production preview screenshot from this phase's regression inspection. |

Before work, Git showed modified `README.md` and untracked Phase 1 application/native files, plus the two supplied specification files. These were preserved. No commit, push, deployment, global Git configuration change, package installation, or native-source edit was performed.

SHA-256 comparisons verified these 12 Phase 1 files remained byte-identical: `src/main.ts`, `src/styles.css`, all three `src/graphics/*.ts` files, `src/storage/settings.ts`, `src/ui/settings.ts`, both original test files, `package.json`, `package-lock.json`, and `capacitor.config.ts`. The existing handoff and specification documents were not edited. Capacitor sync refreshed ignored generated web assets/configuration.

## Domain contracts

- Playable `Level` now uses `width`/`height`, a non-empty `id`, and `arrows`. Optional flat `seed` and `difficulty` metadata are preserved across initialization/restart; an optional `standard` arrow variant is supported. Metadata is optional so handcrafted geometry does not require generation or difficulty scoring in this phase.
- Phase 1's `PreviewArtwork` remains a separate structure with `columns`/`rows`; no preview artwork was converted to a playable Level. Its paths and UI are unchanged.
- `ArrowPath.cells` retains the existing non-empty tuple type for renderer compatibility. Playable load validation requires **at least two** cells.
- `GameState` has a validated, independent `level` snapshot, `ReadonlySet<string>` of active IDs, `mode`, `hearts`, `moves`, `mistakes`, `phase`, and optional `pendingArrowId`.
- The unused placeholder modes `classic`/`relaxed` and phases from Phase 1 were replaced with the specified engine modes/phases. The complete project typechecks without compatibility aliases.

## Important APIs

```ts
// src/game/rules.ts
validateLevel(value: unknown): LevelValidationResult
cellKey(point: GridPoint): string
vectorFor(direction: Direction): GridPoint
traceExitLane(arrow: ArrowPath, bounds: BoardBounds): readonly GridPoint[]
buildOccupancy(level: Level, activeArrowIds?: ReadonlySet<string>): Occupancy
firstBlocker(arrow: ArrowPath, occupancy: Occupancy, bounds: BoardBounds): string | null
getSafeArrowIds(state: GameState): readonly string[]

// src/game/state.ts
createGameState(level: Level, mode: GameMode): GameState
attemptMove(state: GameState, arrowId: string): MoveResult
completeEscape(state: GameState): GameState
restartLevel(state: GameState): GameState
```

`BoardBounds` is `Pick<Level, 'width' | 'height'>`. `Occupancy` is a read-only map from `"x,y"` to arrow ID. Omitting the active Set builds occupancy for all arrows; providing it excludes removed IDs. Each call creates a fresh map.

`LevelValidationResult` discriminates on `valid`: success contains the original validated Level and an empty `issues` list; failure contains `{ code, path, message }` issues. `createGameState` throws `InvalidLevelError` with those issues and a readable message for invalid geometry. Unsupported modes throw `RangeError`. Validation does not normalize IDs, repair cells, or change its input.

Low-level occupancy/collision functions expect a validated Level/path. Load external data through `validateLevel` and/or `createGameState` first. Public lane tracing also checks its dimension bounds defensively.

## Validation invariants and bounds

Each board dimension must be an integer from 1 through exported `MAX_BOARD_DIMENSION = 128`. This bound is a deliberate mobile-engine limit, avoiding unbounded scans from malformed data. Capacity checks reject more arrows than can fit at two cells per path and more total cells than the board can hold.

Paths require non-empty unique IDs, integer in-bounds points, exactly one orthogonal step between consecutive cells, no repeated own cells, no overlaps with another path, and a final segment matching the declared direction. A forward head ray hitting an earlier cell of the same arrow is rejected with `self-head-ray`, even if all other path geometry is valid. Errors identify the affected arrow/cell where applicable. Invalid loads are never silently repaired.

An empty arrows array is geometrically valid; initialization immediately returns `won`. Geometry validation deliberately does **not** establish solvability. A test proves that two valid opposing arrows can deadlock and yield no safe IDs. Solvability verification belongs to Phase 3.

## Formal collision semantics

For head `h` and cardinal unit vector `d`, the exit lane consists of cells `h + d`, `h + 2d`, and so on, stopping before the first cell outside `[0,width) × [0,height)`. The head itself is excluded; the last in-board cell is included. An outward boundary head therefore has an empty, safe lane.

`firstBlocker` visits this lane in increasing distance order and returns the first owner different from the attempted arrow ID, or `null`. The owner's occupied **body** cells count just as its head does. Unrelated rows/columns, the attempted arrow's previous body segments, bounding boxes, and rigid body translation corridors do not enter this decision. Own-cell pathological geometry is rejected during loading, rather than turned into a self-blocking puzzle.

Occupancy only includes active arrows. Removal reveals the next blocker or opens the lane. `getSafeArrowIds` returns exactly the active paths with `null` blockers, in stable Level arrow order, independently of Set insertion order. This is a geometry selector and is intentionally phase-independent; future input/hint UI must separately require `phase === 'ready'` before offering an action.

## State transition contract

| Action / condition | Feedback and next state |
| --- | --- |
| Initialize | Validates and deep-copies known geometry, freezes the Level/arrow/cell arrays and points, creates a fresh active Set, clears counters/pending state, starts ready unless empty. |
| Safe active attempt in ready | `type: 'exiting'`, arrow ID, `moves + 1`, phase animating, pending ID set. All paths remain active and occupied. No hearts or mistakes change. |
| Blocked Challenge attempt in ready | `type: 'blocked'`, attempted ID and first blocker ID, `moves + 1`, `mistakes + 1`, exactly one heart deducted. Zero hearts sets lost. No path removed. |
| Blocked Zen attempt in ready | Same blocked feedback/counters, no heart deduction, stays ready regardless of retry count. |
| Unknown/removed ID in ready | `type: 'ignored'` with unknown-arrow/inactive-arrow reason, exact original state reference, no penalty. |
| Any attempt while animating/won/lost | `type: 'ignored'` with not-ready reason, exact original state reference, no penalty. Phase gating takes precedence over ID checks. |
| Complete current pending escape | Only in animating phase with an active pending ID: clone the active Set, delete that ID, omit pendingArrowId, preserve counters/hearts, return ready or won when empty. |
| Complete without valid pending escape | Wrong phase, absent pending ID, or inactive pending ID returns the exact original state reference. Duplicate completion is harmless. |
| Restart from any phase | Validates/clones the same Level data and metadata, preserves mode, restores all IDs and starting hearts, clears counters/pending state. No seed generation. |

Both modes initialize the stored heart value at **3**. Challenge consumes it; Zen preserves it as an unused counter. Future HUD code should display hearts only for Challenge. `moves` counts actual attempts against current arrows, including blocked attempts; completion and ignored input do not count as attempts.

Transitions never mutate incoming objects, arrays, or Sets. Known Level geometry is detached from caller-owned data, so later source edits cannot alter a created game. Read-only snapshots may safely share frozen Level data and the active Set between transitions that do not remove a path. The public active collection is a native Set exposed as `ReadonlySet`; callers must honor that contract rather than cast it to a mutable Set. Runtime freezing of objects is not advertised as making native Set methods immutable.

Engine functions contain no DOM/canvas/storage imports or access, clocks, timers, randomness, network calls, audio, or animation effects. Future animation code must retain the current state snapshot and call completion only for the current pending escape; stale animation callbacks across restart must be cancelled by that integration layer.

## Actual verification

| Command / check | Result |
| --- | --- |
| `npm run typecheck` | **PASS, exit 0**; strict TypeScript including the new engine and tests. |
| `npm run test` | **PASS, exit 0**; **112 tests in 4 files**, including the original 15 Phase 1 tests and 97 new engine tests. Final Vitest run: 511 ms. |
| `npm run build` | **PASS, exit 0**; 10 UI modules transformed, 805 ms. |
| `npm run android:sync` | **PASS, exit 0**; rebuild passed, web assets copied, Android plugins updated; Capacitor sync completed in 0.14 seconds. This ran only after the other checks passed. All four production files matched their synchronized Android copies by SHA-256. |
| Phase 1 source preservation | **PASS**; 12 monitored files matched their pre-work SHA-256 hashes. |
| Production UI regression | **PASS**; Home and explicitly static Board Preview render; Preview Board/Back navigation and focus restoration work; Settings opens; sound preference survives refresh, then was restored to its original value; Escape closes and restores Settings focus. |
| Browser console | No warnings or errors captured in the successfully inspected production tab. |
| Native APK/device tests | Not run or claimed. The separately recorded Java 21 / Android SDK blocker remains; no SDK components were downloaded. |

The production UI output remains unchanged: HTML 0.67 kB, CSS 11.01 kB, JS 11.95 kB (gzip 0.40 / 2.87 / 4.73 kB). The engine is tested and available as source APIs; it is intentionally not imported into the non-interactive Phase 1 shell yet. Test fixtures are absent from the production UI bundle.

The old preview server had stopped between phases. It was restarted at `http://127.0.0.1:4173/`, and the browser regression was then performed against the actual rebuilt assets in a fresh tab. The initial stopped-server error was environmental and was resolved. Vite/Vitest/build/sync used approved process execution because the Phase 1 sandbox had blocked required Windows subprocesses.

Tests specifically assert explicit lanes/blocker IDs for all four directions, farther-before-nearer storage order, off-lane bent-body obstacles, blockers located on another path's body, every outward edge, blocker removal, malformed loads and self-ray rejection, exact mode counters/loss, delayed final victory, all ignored states, restarts during animation/after loss/win, and deterministic replay. Frozen levels/points and guarded Sets throw on attempted input mutation; earlier snapshots are compared after later transitions.

## Remaining work and Phase 3 readiness

No known unresolved Phase 2 rule or state failures remain. Validation, active occupancy, first-blocker logic, and the safe selector are ready to support Phase 3's seeded generator and solvability checks after approval. Generated candidates must satisfy all invariants, including the self-head-ray exclusion; geometry validation alone cannot certify a solution.

Generator, solver, difficulty scoring, curated gameplay levels, interactive rendering, animation callbacks, hint UI, state/progress persistence, and audio remain outside this implementation. The preview still honestly presents artwork only. Native compilation and physical-device verification remain blocked by the unchanged native environment.

**Phase 3 has not begun. No changes were committed, pushed, or deployed.**
