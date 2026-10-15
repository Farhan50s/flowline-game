# FLOWLINE — PHASE 04: Playable Game, Touch Input & Extraction Animation

**Project:** `D:\PROJECTS\flowline-game`  
**Target:** Android APK eventually; responsive offline browser gameplay now  
**Scope:** Implement and thoroughly test Phase 4 only. Stop before Phase 5.  
**Starting baseline:** 1,205 reported passing tests in Phase 3; verify yourself.

## 0. Role, authority and non-negotiable boundaries

Act as a senior TypeScript/Canvas game engineer, interaction designer, and QA engineer. **Write working code, not another plan.** Inspect the existing repo and Git status first. Read `FLOWLINE_ONE_DAY_GAME_BLUEPRINT.md`, `docs/PHASE_01_HANDOFF.md`, `docs/PHASE_02_HANDOFF.md`, `docs/PHASE_03_HANDOFF.md`, the `src/game` public APIs, current canvas geometry/renderer, UI, storage conventions, and the existing tests. If documents disagree, **actual verified code contracts and the newest handoff take precedence**; document any material conflict. Do not make up APIs.

Preserve existing algorithms, seed/version contracts, fixed reference fixtures, playable geometry rules, test data, settings persistence, Capacitor setup and visual identity. Make targeted changes to existing UI files as needed; unlike Phase 3, Phase 4 **must integrate** the engine into UI. Keep rule/domain code browser-independent and deterministic. No React, Phaser, new backend, remote assets, login, ads, paid features or analytics. Do not install optional libraries without a specific, documented need. Do not commit, push or deploy. Do not start later phases.

**Product milestone:** A user can launch Flowline in a phone-sized browser, start a real puzzle, tap a free or blocked arrow, watch correct bent-path extraction, finish a level, restart, lose in Challenge mode, play without penalties in Zen mode, advance to the next level, and reopen with valid saved progression. The preview can remain accessible as an explicitly labelled art preview but must not be presented as gameplay.

## 1. Use the actual existing APIs

Phase 2 exposes (confirm exact types and signatures in code):
- `validateLevel(value)`, `traceExitLane(arrow, bounds)`, `buildOccupancy`, `firstBlocker`, `getSafeArrowIds(state)` from `src/game/rules.ts`.
- `createGameState(level, mode)`, `attemptMove(state, arrowId)`, `completeEscape(state)`, `restartLevel(state)` from `src/game/state.ts`.
- Modes `Challenge` / `Zen` as defined by the real `GameMode` type; phases `ready`, `animating`, `won`, `lost`.
- `attemptMove` produces discriminated feedback (`exiting`, `blocked`, `ignored`) and does **not** remove a successful arrow until `completeEscape`.

Phase 3 exposes (confirm exact result discriminants):
- `getLevel(levelNumber, difficulty?)`, `generateLevel(seed, options?)`, `solveLevel`, `analyzeDifficulty`, `ONBOARDING_CONCEPTS` from `src/game` modules.
- Levels 1–10 are curated. From level 11 onward, `getLevel` creates seeded procedural levels; **display the measured difficulty**, not an assumed requested tier.
- Generation can return a **typed failure** after exhausting its bounded budget; handle failure without crashing or lying to the player. Preserve `procedural-v1` reproducibility and seed mapping.

Existing Phase 1 settings persist sound, haptics and reduced-motion preferences. Reuse them. Do not accidentally erase them when saving gameplay.

## 2. Screen design and navigation

Stay faithful to Flowline's original warm ivory / ink / teal minimal identity. Use native HTML controls for buttons and menus and Canvas 2D for the board. Ensure controls are comfortably touchable, readable and keyboard-focusable.

Implement a coherent route/state flow:
- **Home:** Flowline identity, `Play`/`Continue` entry, level indicator, mode selection (Challenge / Zen), Settings. Existing preview artwork can be retained in a clearly differentiated preview route.
- **Game:** top header with level number, measured difficulty where present, mode indicator, three hearts in Challenge only, unobtrusive progress e.g. `4 / 7 escaped`; central canvas; accessible Back, Restart, View reset, and optional Hint control if and only if implemented honestly (see §8).
- **Blocked feedback:** short legible visual indication on attempted arrow and/or actual blocker, with mistake/heart update from engine result; no misleading effects.
- **Won overlay:** genuine level completion, Next level, Replay and Home; avoid automatic irreversible navigation.
- **Lost overlay:** zero hearts, Restart, Zen option and Home. Zen must never show heart-based game-over.
- **Loading/failure:** level generation happens outside pointer handlers; show an intentional loading state or disable input; on typed generation failure show a nonfatal recovery action and message instead of starting an invalid board.
- Use `ONBOARDING_CONCEPTS` for short tutorial explanation on first levels, where available; don't overwhelm the board.

Don't mimic copyrighted screenshots, logos or sounds from Lessmore. Keep copy, colors, icon and interactions original.

## 3. Canvas rendering of real levels

Build a renderer for **actual `Level`/`GameState`** separate from Phase 1's `PreviewArtwork`. Draw all active arrow paths tail-to-head in correct cell-grid order, with rounded strokes, clean arrowheads, correctly oriented final segments, and a visible distinction between active/selected/blocked/exiting arrows. At the board bounds, allow proper clipping / offboard animation. Use the existing DPR-aware render infrastructure or refactor it safely with tests.

Maintain a well-defined world→CSS-pixel→canvas-pixel transform and its inverse, independent of device pixel ratio. Center the board and fit its aspect ratio to phones; scale stroke thickness and hit targets sensibly. Avoid overflowing header/footer or colliding with Android safe areas. Support 5×5 curated levels through 13×13 procedural boards, with allowances for larger supported custom levels.

Render loop should be **event-driven when idle** and `requestAnimationFrame` only while animating or handling a view transition. Always clean up listeners/observers/RAF callbacks on route disposal, HMR and game restart. Respect reduced-motion setting including OS preference: immediately or near-immediately settle extraction while still calling `completeEscape` exactly once.

## 4. Touch hit testing, gestures and accessibility

Implement/test point-to-polyline hit detection in CSS coordinates with distance to **each line segment**, not bounding rectangles or grid-cell center alone. The path can bend and be close to other paths; return the closest candidate within a tuned hit radius, with a deterministic tie-breaker. Do not treat empty gaps in a bend's bounding box as taps. Keep collision decisions in the existing game rules only; hit testing identifies the tapped path.

Controls:
- tap/click an active arrow to call `attemptMove` only if `state.phase === 'ready'`;
- pointer down/move/up/cancel with a movement threshold that distinguishes **tap** from drag;
- one-finger pan when zoomed, pinch to zoom on touch screens, mouse wheel zoom where appropriate, and a Reset view control;
- hard min/max zoom, bounded panning so the board remains findable, and accurate hit testing under all transforms/DPRs;
- cancel taps when two pointers are active or a gesture crossed movement threshold; never penalize a player for an accidental pan or pinch;
- prevent browser page scroll/zoom **inside the board only**, not everywhere (use scoped `touch-action`, careful passive listener handling);
- keyboard controls and visible focus for HTML actions; optional arrow keyboard selection is a bonus, not a substitute for working touch controls.

Optional smart press-and-hold preview can be deferred to Phase 5 **unless** it is clearly implemented and tested. Do not ship an inaccurate or fake preview.

## 5. Correct moving-snake extraction — crucial

The Phase 2 collision rule checks an arrowhead's clear **forward exit lane** only. It does NOT authorize rigidly translating a bent polyline across unrelated cells. Therefore successful removal must show the **tip advancing outward while each bend in the body follows the same original centerline** (snake-like / rope-path behavior).

Suggested geometric model (adapt if code structure demands):
1. Convert ordered tail→head grid cell centers to a continuous polyline and compute cumulative arc lengths. Let its initial length be `L`.
2. Extend from head along its cardinal outward direction far enough beyond the viewport to extract the entire tail, including margin.
3. For traveled distance `t`, render the moving body's length-`L` polyline section along that extended curve, from path distance `t` (tail) to `t+L` (head). The arrowhead tangent uses the last visible/actual forward segment.
4. Clip appropriately; when the tail leaves the board, finish gracefully.
5. State stays `animating`, with its pending arrow **still in active occupancy**, throughout the visual effect; at successful completion call `completeEscape(state)` once to remove it.

Do not let other taps change gameplay state while animating. A blocked attempt must not start removal animation. On restart, level change, Home navigation, component unmount, reduced-motion toggle, or interruption: invalidate any stale completion callback/animation token so an old RAF cannot complete a newer puzzle. Avoid rendering mutated coordinates into frozen domain objects; animation state belongs to the display layer.

Use convincing and restrained easing, sensible duration (approximately 180–450ms subject to testing), and no infinite animation loops. Tests must cover a 90° and multiple-bend arrow, all four outward directions, narrow board exits, frame completion, cancel/restart, and duplicate-completion prevention.

## 6. Integrate immutable state faithfully

UI must treat `GameState` and `Level` as read-only. For each valid tap:
- `attemptMove` returns feedback and the next game-state snapshot (read actual discriminant shape);
- if ignored, do nothing and do not penalize;
- if blocked, show feedback and display updated counters; transition to lost if hearts reach zero;
- if exiting, render the existing occupied arrow animation; once the correct pending animation finishes, call `completeEscape` and update UI;
- only the final successful completion can transition to won.

Never directly remove an active ID, decrement hearts or change mode through UI mutation. Engine alone owns move outcomes. Do not let `getSafeArrowIds` bypass the `ready` gate. Ensure UI can handle the empty-board `won` state gracefully even if progression normally avoids it.

## 7. Local progression and session restoration

Implement versioned and defensive offline persistence without new permissions, backend or third-party services. Phase 1 settings must be untouched. Keep **highest unlocked level**, selected mode and the current run's **committed attempt history** or an equally robust minimal representation. Storing an array of attempted arrow IDs is a useful option: blocked attempts update immediately, while successful attempts are only committed **after** `completeEscape`.

On startup/load, retrieve the same deterministic Level and reconstruct state by replaying legal engine operations (`attemptMove` then `completeEscape` for successful attempts); validate schema/version, level ID/recipe identity and outcomes. Never trust serialized Sets, mutable state snapshots, stale procedural geometry, or partially completed animation payloads. If the app closes mid-extraction, restore to the last committed ready state. Invalid/corrupt/unsupported saves must degrade safely to a fresh playable level while retaining valid independent progress where possible.

- Progress must not unlock a level from a mere winning animation start; only after engine reaches `won`.
- Do not rewrite all prior generated levels or store huge geometries; preserve recipe-version stability.
- Do not persist unbounded event histories without a sensible limit/check; worst-case repeated blocked attempts need a safeguard.
- Catch storage denied/quota errors gracefully; user can still play, with a clear non-blocking message when progress can't be saved.
- If level generation is delayed, use an explicit loading state; defer/prefetch generation so it never blocks a touch gesture or extraction frame.

## 8. Scope for hints, audio and haptics

Audio synthesis, sound themes, music, advanced haptics, and monetization are **Phase 5**, not required here. You may provide a modest visual hint using `getSafeArrowIds` only if it selects a currently safe active arrow, is disabled outside `ready`, has a functional button, and is tested. Do not promise a hint feature if it is not implemented. Existing sound/haptics settings should remain functional as preference controls, with no pretend audio side effects.

## 9. Testing requirements

Run the pre-change baseline (reported **1,205 tests**) before substantial edits. Preserve all currently passing tests and deterministic reference vectors. Add meaningful tests for:
- board coordinate transforms, DPR variants, and viewport resizing;
- point-to-polyline nearest selection, off-path taps, tiny gaps, bends and ties;
- touch tap-vs-pan and pinch gesture state transitions, zoom/pan limits, transformed hit detection;
- straight and bent snake extraction at start/mid/end and different facing directions;
- stale RAF cancellation, duplicate callbacks, interrupted play and reduced-motion completion;
- integration: blocked Challenge loses one heart, blocked Zen loses none, safe tap pending→completed, final win, lost state, restart during animation, next level;
- saved-progress round-trip, deterministic replay, corrupted/unknown version/stale saved data, mid-animation restart/restore, and quota errors;
- typed `getLevel` failure paths (use mocks or genuine bounded options without modifying the generator);
- responsiveness of levels 1, 4, 10, 11, and representative expert layouts;
- no gameplay mutation of frozen/readonly geometry and no unexpected rules-module DOM imports.

Use unit tests for pure geometry/state adapters. If browser automation is available, actually open production build and test mouse clicks, touch/pointer interactions at 320×568, 390×844, 430×932, landscape 844×390, and a larger desktop view. Exercise a complete level victory and a three-mistake Challenge loss. Inspect console for errors and record observed behavior. **Screenshots are useful, but don't substitute for actual gameplay interaction tests.** If mobile multitouch or Android device cannot be exercised, report it clearly; don't claim it passed.

Make performance practical: no constant idle RAF; avoid synchronous procedural generation in pointer handlers or animation frames; avoid redraw/layout thrashing; no unbounded memory growth. Prefer runtime measurement over assumptions.

## 10. Build checks and Android limitation

Run and include actual output/status for:

```powershell
npm run typecheck
npm run test
npm run build
npm run android:sync
```

The Phase 3 environment could **not** make a native APK because Java 21/Android Studio/SDK were absent. Do not claim native compilation from Capacitor synchronization alone. You may inspect whether the environment has changed and attempt a real debug build if prerequisites are now present; otherwise preserve this as an explicit blocker. Do not silently install huge native toolchains.

## 11. Deliverables and handoff

Create `docs/PHASE_04_HANDOFF.md` with:
1. implementation summary and file changes;
2. exact screen flow and gameplay-controls instructions;
3. explanation of hit testing and geometric snake extraction with cancellation;
4. progression storage schema/version and corruption handling;
5. actual typecheck, test count, production build and sync results;
6. recorded hands-on browser verification, viewports and any missing native/multitouch testing;
7. limitations, bugs or deferred Phase 5 polish;
8. APK/toolchain status;
9. readiness checklist for Phase 5.

Include real production screenshots under `docs/verification/` if the toolchain allows. Preserve existing verification artifacts. If a significant design tradeoff is necessary, describe why. Return a concise final report with commands and any limitations; then stop.

**Phase 4 acceptance criteria:** Real levels appear; taps reliably distinguish arrows; collision outcomes match Phase 2; bent arrows visibly travel along their own curve; level completion/restart/modes work; local progress restores; mobile layout behaves; all regressions pass; production build and Capacitor sync pass. **Do not start Phase 5; do not commit, push or deploy.**
