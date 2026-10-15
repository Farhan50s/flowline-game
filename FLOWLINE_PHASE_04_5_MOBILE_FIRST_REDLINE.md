# FLOWLINE — PHASE 4.5: FULL-SCREEN MOBILE GAMEPLAY REDESIGN

## Context and mission

You are a senior mobile-game UI engineer, Canvas renderer engineer, interaction designer, and quality engineer. The owner rejected the Phase 4 gameplay layout because it feels like a small web application inside a mobile screen rather than an immersive mobile game. **Treat this as a product-blocking issue, not minor styling polish.**

The user provided two reference screenshots:
- FLOWLINE at 390 × 844: header and prose, a bordered game card approximately 244 × 182, four rectangular buttons, permanent instructions, and a large amount of unused vertical space.
- Reference arrow-escape mobile game at 335 × 597: compact three-part top HUD; an intricate, comparatively large arrow composition in an uninterrupted white play region; only two floating controls at the bottom.

Use the screenshots and this description as **layout/functionality inspiration, not as assets to copy**. Maintain original Flowline brand styling, code, icons, paths, assets, and audio. The target is equal or better *usability and display efficiency*, not a pixel clone.

The game is already functional: 1,315 tests, original seeded generator, immutable gameplay engine, snake extraction, Canvas interaction, Zoom/Pan, offline save restoration, Challenge/Zen modes. Preserve these working behaviors. Native APK compilation is currently blocked by Java 21/Android SDK; do not misreport APK success.

## Mandatory preflight

1. Inspect Git status, `docs/PHASE_04_HANDOFF.md`, existing design tokens, Canvas viewport/board transforms, real rendered UI, input/gestures, and all test suites. Read the engineering blueprint if present.
2. Capture baseline screenshots of the running production game at 320×568, 360×800, 390×844, 430×932 and 844×390. Note visual bounds of the visible path strokes (not just the canvas HTML element).
3. Preserve existing `src/game/{rng,rules,state,solver,difficulty,generator,levels}.ts`, seeded geometry/recipe v1, save schema, and test reference fixtures unless a separately proven fix is unavoidable. No silent progression/seed migration.
4. Work from the actual repository. No fake UI, fake data, hidden errors, or tests that merely assert strings in CSS.

## A. Full-viewport gameplay layout — REQUIRED

Implement a distinct gameplay route/screen occupying the phone's complete usable viewport:
- Gameplay root: responsive dynamic viewport height (`100dvh` with fallback) and viewport width, with cutout/safe-area support. No page/document vertical or horizontal scrolling in active portrait gameplay at supported device sizes. Leave Home/Settings layout independent.
- A **full-bleed Canvas interactive surface** spans the gameplay viewport, behind overlays. Remove the bordered/rounded game card and artificial width/height caps. Avoid a centered narrow column inherited from desktop page CSS.
- Overlay controls are layered above the canvas with minimal visual weight. Container overlays do not block taps in the empty portion of their area (`pointer-events` rules); real buttons do intercept taps.
- Define a `playableSafeRect` (or equivalent) by subtracting top HUD and bottom controls/safe-area/padding from the full Canvas rectangle. Draw paths maximally fit *inside this safe rect*, preserving aspect ratio and consistent grid geometry. Do not let puzzle arrowheads hide under buttons/notches. This rect must be the source of truth for rendering, inverse transforms, hit detection, zoom anchors, and pan limits.
- Header as a compact, fixed or overlaid single row: a level/back-or-pause chip at left, three hearts centered for Challenge (or clearly represented Zen status), measured difficulty at right. Design for ~48–64 CSS px of content height, plus safe inset. The whole header is not a second scrolling section. Keep a11y labels.
- Move secondary actions (Home, Restart, Challenge/Zen details, Sound/Haptics and possibly manual zoom help) into a Pause / Settings sheet or modal. Keep restart reachable within two taps, not buried in a long menu.
- Bottom controls: at most **two primary circular floating controls**, 48–56 CSS px touch targets minimum with comfortable spacing, in a ~64–80 CSS px control region plus safe inset. Preferred: Hint (only when genuinely implemented; otherwise use a true View Assist / Zoom-to-fit action) and a View/Center button. Do not ship a fake Hint. No visible row of 'Restart / Reset view / − / +' rectangular buttons.
- Support pinch zoom and one-finger pan at zoom; keep desktop wheel and keyboard support. A small unobtrusive zoom/reset action must stay available for accessibility. Optional double-tap zoom may be added if proven not to misinterpret gameplay taps; no gesture regression.
- Remove permanent explainer paragraphs, difficulty numeric score, debugging text, keyboard directions and 'tap to...' instruction blocks from normal gameplay. Move help into onboarding overlays or Pause > How to Play. Use brief accessible toast/screen-reader messages for result feedback.
- Keep a clean, almost white/ivory, high-contrast playfield. Remove or disable persistent grid dots on advanced levels. Keep thin crisp dark paths, clear directional heads and restrained error/safe highlights. Ensure visibility outdoors and on low-DPI displays.
- Large/small board distinction: for a sparse 7x7 starter board, scale the shapes as large as feasible by width and center vertically in the safe play region. **Do not stretch a square board into a tall rectangle** or distort logical cells. A physically tall, dense design requires new level geometry rather than CSS tricks.

## B. Board fit, interaction, and animation integrity — REQUIRED

- Refactor viewport code as needed to accept a board-safe rectangle or translated origin; ensure world-to-screen and screen-to-world remain exact inverses after DPR scaling, resize, safe areas, pinch and pan.
- Fit maximum available board width within reasonable margin (~12–20 CSS px), without clipping winding segments or arrowheads. Path stroke thickness may vary with board density/zoom, with limits so small grids do not look gigantic and dense grids do not merge.
- Preserve original head/body hit semantics and snake extraction; no rigid translation of bent arrows. Animation exit must clear the full-bleed Canvas viewport while respecting the new safe play zone.
- Don’t incur a mistake when a tap misses a line, hits overlapping/ambiguous nearby paths, hits an overlay, begins a drag, or follows a pinch. If nearby paths cannot be reliably distinguished, offer zoom-to-touch / highlight or require an explicit selection confirmation; do not silently pick a neighboring arrow and deduct a heart. Selection design should be tested at realistic finger-sized hit ranges.
- Maintain correctly cancelable animations and committed save transitions across orientation changes, screen resize, Pause, Home, restarts, visibility and next-level loads.
- Preserve Canvas render-on-demand/finite animation; no perpetual frame loop, no new unnecessary dependency.

## C. Difficulty and visual density assessment — REQUIRED

**Do not confuse the visual redesign with generator parity.** Current procedural-v1 uses easy 7×7 with 6–8 arrows; medium 9×9/11–14, hard 11×11/18–21, expert 13×13/24–27. The original user reference shows a dense hard-level *style*, not a seven-arrow tutorial. This is a real feature gap.

In this phase:
1. Render and screenshot real levels 11 (sparse), 41 (hard), and 81 (expert) with the new design. Include actual arrow counts and coverage data in QA notes.
2. Improve visible thin-line hierarchy and packing as far as possible **without changing procedural-v1 output or its recorded IDs**, including fit/layout, anti-aliasing, proportions, and zoom behavior.
3. Write `docs/DENSE_LEVEL_V2_PLAN.md` describing the independent, versioned future generator for dense challenge compositions. Specify an exploration range of roughly 40–120+ arrows on taller/denser grids, scalable path width/spacing, human playable zoom, performance budgets and touch disambiguation. These are **design targets, not already-proven counts**. Validate targets by generator results and device usability, not appearance alone.
4. Never fake density by painting decorative, non-interactive arrows over the level, multiplying strokes, or relabeling 'easy' as 'hard'. Every visible arrow must be validated, interactive, removable and solvable.
5. Treat saved generated puzzles as stable. If a future v2 generator ships, use explicit `procedural-v2` identity and migration/progression policy; do not rewrite v1 generated Level 11 or previously saved seeds.
6. Do not implement the full dense v2 generator in this layout-redesign phase unless explicitly approved after visual QA. The near-term blocker is the small layout. Clearly disclose that expert density may remain below reference after this phase.

## D. Visual acceptance benchmarks — REQUIRED

At 390×844 portrait:
- **The game surface fills the phone's usable viewport.** No framed mini-canvas/card.
- HUD compact near top; bottom controls compact floating; no full-page list of buttons/instructions.
- Gameplay region between overlays should occupy at least ~75% of usable viewport height (this is the *interactive region*, not a guarantee that square path artwork uses that height).
- Level 11 sparse geometry should use at least ~80% of the safe region's usable width, except when intentional adaptive margins are documented.
- For denser levels 41/81, layout should strive for 85–95% available width without clipping and should visibly convey greater complexity, without falsifying difficulty.
- Make before/after screenshots from identical level and viewport. User should instantly see that nearly all previously blank screen is now dedicated to gameplay.

At 320×568 portrait:
- HUD and bottom actions stay in safe region; no page scroll or clipped fixed buttons; no false interactions underneath overlays.

At 844×390 landscape:
- Adjust control placement to sides/compact overlay rather than shrinking the puzzle to a tiny central card. No unintentional content hiding.

Across Android-like cutout/navigation insets:
- Account for `env(safe-area-inset-*)` and Capacitor SystemBars. Do not assume browser screenshot proves real device cutout behavior.

Preserve accessibility: button accessible names, live score/heart announcements, focus handling, keyboard path selection and reduced-motion support.

## E. Verification and sign-off

1. Re-run full existing baseline (1,315 tests) and 1,000-seed regression; all must continue passing.
2. Add targeted tests for layout safe rect calculations, board-to-screen/screen-to-board inversion, hit testing at zoom/offset, overlay event interception, portrait/landscape resize, small-screen navigation, animation cancellation, pause/restore, and preservation of saved progress.
3. Run `npm run typecheck`, `npm run test`, `npm run build`, `npm run android:sync` and report genuine exit codes and test counts.
4. Use browser GUI to inspect actual gameplay in **normal motion if possible**, with a truthful note if the testing host enforces reduced motion. Test real click-to-remove, blocked heart loss, win, restart, pause/resume, in-progress save restoration, zoom/reset and touch simulation as available. Never claim physical multitouch without a physical device test.
5. Capture side-by-side **before/after** screenshots from the same production Level 11 at 390×844, and new Phase 4.5 screenshots of level 41 / 81 at 390×844, plus 320×568 and 844×390. Provide actual screenshot file paths and quantified bounding-box/safe-region observations.
6. Write `docs/PHASE_04_5_HANDOFF.md` with files changed, visual screenshots, verification table, remaining limitations, full v2 density caveat, native Android prerequisite status, and whether acceptance benchmarks passed.
7. Do not commence Phase 5 (audio/haptics) or density generator v2; no commit/push/deploy unless owner approves.

## Final priority instruction

**Do not solve this only by enlarging the existing card, changing a couple of margins, or hiding buttons.** Recompose the screen as a native-feeling game: full-screen Canvas, minimal fixed HUD, floating contextual controls, clean immersive board fitting, precise touch handling and tested end-to-end gameplay. User judges success by the actual mobile screenshot and tap experience, not only tests/build status.
