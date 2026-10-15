# FLOWLINE — PHASE 03: SEEDED LEVEL GENERATION, SOLVER & DIFFICULTY

**Project:** `D:\PROJECTS\flowline-game`  
**Scope:** Phase 3 only. Implement real code and tests, not merely a plan.  
**Goal:** Generate original, deterministic, validated, solvable arrow-extraction puzzles; create a curated onboarding sequence; quantify difficulty without misleading labels.  
**Time budget:** Aim for ~1.5–2.5 focused hours with an agent. Correctness takes priority over decorative features.

## 0. Your role, context, and non-negotiables

Act as a senior TypeScript game/simulation engineer, procedural generation specialist, test engineer, and technical reviewer. This is an **original game**, not a replica of Lessmore's assets/levels/UI/audio.

First read these local files, if present:

1. `FLOWLINE_ONE_DAY_GAME_BLUEPRINT.md`
2. `FLOWLINE_PHASE_02_AGENT_PROMPT.md`
3. `docs/PHASE_01_HANDOFF.md`
4. `docs/PHASE_02_HANDOFF.md`
5. Existing `src/game/types.ts`, `src/game/rules.ts`, `src/game/state.ts`, and tests/fixtures

Inspect the real repository and `git status` before touching anything. **Do not assume APIs differ from the installed code**. Preserve user work, existing architecture, UI, preferences, package lockfile, Android native sources, and every Phase 1/2 test. Do not commit, push, deploy, or silently install tooling. Do not implement Phase 4.

The Phase 2 handoff reports **112 passing tests in four files** with browser-independent, immutable domain logic. Verify rather than assuming this still holds.

## 1. Existing source-of-truth contracts

Check the actual TypeScript declarations. The handoff reports these APIs:

```ts
// src/game/rules.ts
validateLevel(value: unknown): LevelValidationResult;
cellKey(point: GridPoint): string;
vectorFor(direction: Direction): GridPoint;
traceExitLane(arrow: ArrowPath, bounds: BoardBounds): readonly GridPoint[];
buildOccupancy(level: Level, activeArrowIds?: ReadonlySet<string>): Occupancy;
firstBlocker(arrow: ArrowPath, occupancy: Occupancy, bounds: BoardBounds): string | null;
getSafeArrowIds(state: GameState): readonly string[];

// src/game/state.ts
createGameState(level: Level, mode: GameMode): GameState;
attemptMove(state: GameState, arrowId: string): MoveResult;
completeEscape(state: GameState): GameState;
restartLevel(state: GameState): GameState;
```

Playable `Level` uses `id`, `width`, `height`, `arrows`, and optional flat `seed`/`difficulty`. `ArrowPath.cells` is an ordered orthogonally contiguous array from **tail to head**; it has at least 2 cells, never overlaps another arrow, has no self-intersection, and its last segment agrees with `direction`. A ray from its head forward must not cross an earlier cell of the same arrow (`self-head-ray` invalid). Board dimensions must be integers between 1 and `MAX_BOARD_DIMENSION = 128` inclusive. These are **existing validation rules**, not concepts to redefine.

Collision checks **only the head-forward exit lane**, not the rigid translation corridor of the bent body. Active arrows are obstacles along the lane, even if their *body*, rather than head, occupies it. The first blocker is the closest along the ray. Avoid logic that changes this rule.

Game state has `activeArrowIds`, `mode`, `phase`, `hearts`, `moves`, `mistakes`, and optional `pendingArrowId`. A safe `attemptMove` enters `animating`; `completeEscape` finally removes that arrow. Solver tests must respect these APIs or use an equivalent pure active-set simulation with results cross-checked against those state transitions.

## 2. Work to deliver

Implement, in modular TypeScript under `src/game/` as appropriate:

- Deterministic seed-based pseudo-random generator utility (`rng.ts`, if useful).
- Solvability solver (`solver.ts`) with a witness order and explicit failure report for deadlocks.
- Constructive level generator (`generator.ts`), respecting all Phase 2 invariants.
- Difficulty analyzer/scorer (`difficulty.ts` or appropriately co-located pure helpers).
- `levels.ts` containing **10 original hand-authored, solvable onboarding levels** and a deterministic mapping for procedural levels 11+.
- Robust new Vitest suites for these modules under `src/tests/`.
- `docs/PHASE_03_HANDOFF.md` and useful fixture/benchmark documentation as appropriate.

Implement the functions with clear exports, descriptive documentation, and typed failure results. Prefer a coherent small public API rather than exposing many unnecessary helpers. Keep pure domain code independent of DOM, Canvas, localStorage, audio, Capacitor, file system, clocks, timers, and network access.

## 3. Seeded determinism

Choose and document a small stable 32-bit seeded PRNG (e.g. Mulberry32), using explicit JavaScript bitwise and `Math.imul` semantics. Make reproducible randomness **private to each generation call**; never use `Math.random()`, `Date.now()`, `crypto.getRandomValues()`, process-global RNG state, or platform-dependent sorting for game layout decisions.

Define supported seed bounds and validation. A valid seed plus identical options must produce identical serialized level geometry, arrow IDs, directions, ordering, difficulty metadata, and witness removal order across calls and JS runtimes. A new generator invocation must not affect the results of an earlier seed. Invalid or unsupported inputs should produce clear typed errors, not silent coercion.

Use stable level IDs and arrow IDs derived from deterministic data, not timestamps or UUIDs. Level N must consistently map to the same seed/difficulty via a documented deterministic function (e.g. integer hashing). Restarting an already generated level must retain its original geometry and seed. The generator should not consume or mutate external state.

## 4. Generator: reverse-construction algorithm

**Why it works:** Begin with an empty board and add one arrow at a time. To accept a new arrow B, its head-forward exit lane must be clear of arrows already placed. New B may block older arrows A. Once the board is finished, removing arrows in **reverse placement order** always gives a valid solution, provided every accepted insertion preserved the invariants.

Implement the following rigorously:

1. Choose a board size, target arrow-count range, path-length range, maximum bends, and density target by difficulty profile. Keep first-day/mobile board sizes reasonable (illustratively easy 6x6–7x7, medium 8x8–9x9, hard 10x10–11x11; calibrate based on actual generation success).
2. Propose a **tail-to-head** connected orthogonal path of 2–7 cells, 0–3 bends in the initial profile; include both straight and visibly bent arrows. Avoid repeated own cells, overlaps, nonadjacent steps, and final-segment/direction mismatches. The arrowhead should look readable on mobile.
3. Reject any candidate if `validateLevel` fails on the augmented board, including `self-head-ray` rejection.
4. Additionally require that the **candidate arrow itself** has no blocker against all arrows already accepted (call Phase 2 `firstBlocker` / `traceExitLane` / `buildOccupancy` as appropriate). This is the solvability construction invariant. It is fine (desirable) for the new candidate to block earlier arrows.
5. Store or derive the reversed placement order as an internal witness. After building the level, independently verify the complete level using the solver described below. Reject failures; never ship an unverified board.
6. Prefer levels with meaningful inter-arrow dependencies, multiple bends, varied directions, and reasonable occupancy. Avoid empty, almost entirely independent, visually indistinguishable, or pathologically packed boards.
7. Use *bounded* per-arrow proposal attempts, per-level candidate attempts, and overall candidate-selection budgets. Never hang or run unbounded loops for high-density requests.
8. If requested constraints cannot be met within the configured budget, return a descriptive typed failure or report a clearly identified **lower actual difficulty**. Do not silently label an easy result `expert`, manufacture impossible levels, or claim the required count was met when it was not.
9. Preserve immutable-style returns. Any generated `Level` passed to the state engine must be accepted by `validateLevel` and `createGameState` without special compatibility cases.

Make candidate generation efficient on mobile; reuse occupancy/grid lookups where reasonable, but do not prematurely optimize away validation. Favor predictable performance and correctness over artificially ambitious puzzle density.

## 5. Solver and proof of solvability

Design a solver that is **independent of generator placement/witness metadata**. It must inspect only the playable level and Phase 2 rules. Return a discriminated result:

- `solved: true`, a removal order of every arrow exactly once, a safe-choice trace, and optional stats.
- `solved: false`, IDs of remaining arrows, reason `deadlock` (or `invalid-level` as appropriate), and available diagnostics.

Key mathematical invariant: On a fixed non-moving board, removing a currently safe arrow *cannot create new occupancy*, so it cannot block any previously safe arrow. Consequently a greedy algorithm is complete for this game's standard removal-only rules. No exponential backtracking is needed.

Recommended implementation:

```text
Validate the level.
Create the existing immutable GameState in Zen or Challenge.
While there are active arrows:
    Find currently safe IDs using the Phase 2 selector.
    If none, report deadlock with remaining IDs.
    Deterministically choose one (stable Level arrow order).
    Call attemptMove; assert type 'exiting'.
    Call completeEscape; assert the active count decreased by 1.
    Append the ID and step diagnostics.
If none remain, assert phase 'won' and return solution.
```

Do not simulate blocked moves to solve the puzzle or burn hearts. Do not hide errors. Handle geometrically valid but *unsolvable* deadlocked levels, including the opposing-arrows fixture from Phase 2. No mutation of input levels or snapshots. Completion must terminate within at most `level.arrows.length` successful removals. An empty validated level may have a zero-length solution, but generator output must be nonempty.

Also verify the reverse-construction witness independently in tests using the **same Phase 2 state APIs**, and compare solver success to witness success. The witness need not equal the greedy solver's order.

## 6. Difficulty analysis (not just level number)

Build a deterministic analyzer. For each arrow A, enumerate **all** other arrows B occupying A's head-forward ray (not just the current first blocker). Treat A as dependent on every such B. For generated levels, dependencies should be acyclic by reverse construction. Measure and expose at least:

- Arrow count and occupied-cell density.
- Number/ratio of bent arrows and mean turns per path.
- Number of blocking relationships (direct edges).
- Initial safe-arrow count / fraction.
- Longest blocking dependency chain (for generated DAGs).
- Safe choice counts during one deterministic solver trace; optionally fraction of states with a single safe choice.

Handle non-generated cyclic/deadlocked boards gracefully; do not recurse forever. A cycle detection flag or explicit `unsolvable` diagnostic is appropriate.

Define an explainable, deterministic scoring model with a stable numeric score and suggested tier (`easy | medium | hard | expert`), plus raw stats for auditability. The score should account for visually complex layout *and* blocking constraints. Record thresholds clearly. Labels are heuristic product descriptors, not a scientifically validated measure of human solving difficulty. Check requested difficulty against **actual** scored difficulty and reflect mismatches instead of silently mislabeling.

For the first version, quality is more important than all four tiers achieving perfectly balanced distributions. A smaller set of consistently generated, meaningfully differentiated tiers is acceptable if honest and documented.

## 7. Level progression

Create exactly **10 original, hand-authored onboarding levels** that increase in concepts/complexity:

- Introduce a single safe arrow and simple outward exit.
- Introduce a blocked arrow that needs another removed first.
- Introduce vertical arrows and both directions.
- Introduce bends, body-cell blockers, and nearest-blocker behavior.
- Introduce a few simultaneous safe options and increasing visual density.

All 10 must be geometrically valid, demonstrably solvable, have original IDs and unique layouts, and be tested. Use them as real gameplay `Level` objects, **not** Phase 1 `PreviewArtwork` structures. Do not alter or mislabel the existing non-interactive preview screen.

Provide a pure API for retrieving level N (positive integer), optionally with deterministic difficulty configuration:

- 1 through 10 → original curated onboarding levels.
- 11 onward → deterministic generated puzzles with a stable seed mapping.

Define behavior for invalid level numbers, unsupported difficulty, and generation failure. Keep levels independent of GUI and external storage. Do not hand-edit the Phase 1 preview art into playable levels. Do not hardcode dozens of huge handcrafted puzzles; 10 thoughtful originals suffice for onboarding.

## 8. Tests — required coverage

Add meaningful Vitest coverage; do not game test counts or add no-op assertions. The existing **112 tests must continue passing**.

At minimum, cover:

1. Same `(seed, options)` yields byte-for-byte-identical serialized level, IDs and witness.
2. Different seeds create varied layouts across a representative sample (avoid relying on every adjacent pair being unique under tight constraints).
3. PRNG reproducibility, no global-RNG coupling, and invalid input handling.
4. Every generated level validates under **existing** `validateLevel` and initializes successfully with `createGameState`.
5. Non-overlap, orthogonal adjacency, directions, at least two cells per path, no self-ray rejection, and correct widths/heights.
6. Real straight and bent arrows appear across seeds and difficulty profiles; arrowheads/exit lanes stay geometrically valid.
7. Generated witness removal order works through `attemptMove` + `completeEscape` in actual game state.
8. Independent solver successfully finishes every generated level in the property sample.
9. Solver catches deadlocked **valid** levels and reports all remaining arrows without crashing or infinite looping.
10. Complete single-arrow and empty-level solver edge cases, invalid levels, and original-object immutability.
11. Deterministic difficulty stats/score, expected monotonic-ish aggregate complexity by tier across samples (avoid brittle strict per-seed assumptions).
12. Every curated onboarding level is unique, valid and solvable; progression API maps 1–10 to curated and 11+ to stable procedural output.
13. Repeatability across invocation order; no state leakage between two PRNG calls or generator calls.
14. Bounded termination for impossible/overspecified requests; fail clearly rather than looping.
15. Regression for Phase 2 `firstBlocker`/`getSafeArrowIds` semantics and deferred state completion.

**Property/seed verification:** Run at least **1,000 deterministic generated seed cases total**, covering multiple difficulty settings, and record the exact sample configuration, success/failure totals, test runtime, and any rejected candidate/generation statistics. Use a bounded suite so the tests do not hang. If 1,000 cases are too expensive, improve generation efficiency before claiming Phase 3 complete; report an honestly incomplete target if unsolved.

Add a readable benchmark/sample report comparing tiers; do not use performance numbers you did not measure. Verify practical runtime and avoid pathological long stalls. If complexity causes flaky CI due to timeouts, investigate rather than weakening correctness coverage.

## 9. Integration boundaries

This phase is **domain and data only**:

- Do not modify the existing Phase 1 home/Board Preview/settings/navigation unless absolutely necessary for compilation. The artwork-only screen remains clearly non-playable.
- Do not implement tap controls, extraction animations, audio, haptics, hints UI, achievement systems, monetization, network features, daily online events, saving progression, or gameplay HUD. These belong in later phases.
- No new dependency is expected. If one seems necessary, explain why before installing it.
- Preserve the `src/game/state.ts` and `src/game/rules.ts` semantics; reuse rather than duplicating collision rules.
- Avoid writing native Android files. SDK/JDK configuration remains an environment issue.

## 10. Exact verification commands and evidence

Run from project root on Windows:

```powershell
npm run typecheck
npm run test
npm run build
npm run android:sync
```

Inspect existing browser preview if browser tools are available and confirm it still identifies itself as a non-interactive preview; check for console errors. If browser tools are not available, report that explicitly rather than claiming a UI regression pass.

You may perform an optional **documented** performance check using an actual timed run of a seed sample; include sample size and machine/browser/runtime context.

The Android debug APK remains **blocked** until compatible Java 21, Android Studio and SDK components are installed. Don't mistake `android:sync` for native APK compilation. Do not claim an APK exists without verifying the output file.

## 11. Handoff report and stop condition

Create `docs/PHASE_03_HANDOFF.md` covering:

- Exact source files changed/created; untouched safeguards.
- Generator algorithm, configuration, bounds, seed/PRNG contracts, failure behavior.
- Solvability proof and independent solver behavior.
- Difficulty metrics and thresholds; measured differences between tiers.
- 10 curated levels and deterministic Level N mapping.
- Exact tests and property verification, including **1,000-seed sample** evidence and timing.
- `typecheck`, test, build, Android sync, and any browser regression results.
- Known problems, rejected/underperforming difficulty bands, measured performance, and Android prerequisite blocker.
- Precise readiness for Phase 4: connect playable UI + rendering + input + animation safely while respecting `pendingArrowId` and stale animation cancellation.

**Finish only when correctness, deterministic reproducibility, and bounded runtime are demonstrated—or document the specific unresolved blockers accurately.** Do not start Phase 4. Do not commit, push, or deploy anything without explicit user approval. Return a concise factual summary with link/path to the handoff.
