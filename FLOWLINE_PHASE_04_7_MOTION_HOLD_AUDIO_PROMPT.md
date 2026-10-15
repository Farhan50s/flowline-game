# FLOWLINE — Phase 4.7: Interaction Fidelity, Extraction Motion, Trail Dots & Minimal Audio

**Status:** Implementation brief for an AI coding agent. **Not implemented.**

## Mission

Make Flowline feel like a polished, tactile, mobile-first arrow-escape game. A correct puzzle engine alone is insufficient: the player must see a continuous winding-arrow exit, visual progress along the vacated path, a responsive forward-lane preview on hold, and subtle original sounds. Preserve the genuine engine semantics and accessibility.

The reference game establishes interaction *principles*, not assets to clone. Create our own motion timing, dots, highlights, sounds, graphics and UI. Do not copy protected graphics, sound files, exact levels or branding.

### Read before changing anything

1. `docs/DENSE_V2_FEASIBILITY_HANDOFF.md`
2. `docs/PHASE_04_5_HANDOFF.md`
3. `docs/PHASE_04_HANDOFF.md`
4. `FLOWLINE_ONE_DAY_GAME_BLUEPRINT.md`, if present
5. Actual implementations of:
   - `src/graphics/animation.ts`, `game-board.ts`, `viewport.ts`, `mobile-layout.ts`, `celebration.ts`
   - `src/input/gestures.ts`, `hit.ts`
   - `src/game/rules.ts`, `state.ts`, `types.ts`
   - `src/gameplay/session.ts`, `src/ui/settings.ts`, `src/main.ts`
   - `src/research/dense-v2/lab.ts` and related research files
   - all relevant unit/browser tests.

Inspect Git status and identify the modified/untracked state before making changes. Do not erase existing work, rewrite generated-level identities, or commit/push/deploy.

## A. Diagnose the existing visual-motion gap FIRST

There already is a centerline-window snake extraction (`curveWindow`) and cancellable frame driver; do not throw them away or reinvent rigid translation. The Phase 4.5/4.6 reports state that the test host enforces reduced motion and that normal-motion evidence was captured through a lab-only override. In normal production, effective reduced motion is stored preference OR OS preference.

Before implementing changes:
- Trace whether active normal-motion extraction is actually visible in the shipping game when OS reduced motion is off.
- Check actual frame progression and clipping through the **full** departure (including arrowhead exiting and trailing body following bends).
- Determine whether the arrow exits too quickly, appears to teleport, or disappears when the viewport-safe clipping begins.
- Record the measured full-motion duration, traveled arc length, number of frames and visual inspection findings.
- Confirm the dense research lab uses the **same** shared renderer and engine callbacks; avoid lab-only illusions of functionality.
- Do not bypass the OS accessibility preference silently. Provide a documented, intentional route to test full motion (existing QA lab override or an explicit user-invoked motion setting that preserves accessibility and migration compatibility).

## B. Tap versus press-and-hold — precise contract

Use a single pointer state machine that disambiguates actions. Suggested hold threshold: **220 ms** (tune after device testing); tap movement tolerance: existing **8 CSS px**. Threshold should be adjustable for tests and responsive on common phones.

- **Quick tap on an arrow:** exactly one engine `attemptMove` when `ready`.
- **Press and hold on an arrow:** when threshold elapses with the pointer still held and unmoved, show a **purely visual preview**. No engine attempt, no move increment, no heart deduction, no save operation and no hint charge.
- **While held:** emphasize the selected complete arrow (including bends) and its exact **forward head ray**. Render a ruler/scale-like overlay along the straight exit lane with small regular ticks or dots and a subtle direction cue; the visual remains only while held. Derive direction and cells from `traceExitLane` and occupancy/`firstBlocker`. If blocked, indicate actual first blocker truthfully (e.g. coral contact marker) and optionally fade the unreachable remainder; do not claim the arrow is free.
- **Release after hold:** immediately remove preview, never attempt a move. Prevent any synthetic `click` from firing a tap afterward.
- **Pointer moves beyond tolerance:** classify as gesture/cancel, not a tap or hold. Pinch, pan, wheel zoom and viewport controls must not cause any attempts.
- **Ambiguous or offscreen contact:** preserve current no-heart-loss magnify/retap behavior. Never preview or extract a guessed neighbor.
- **Unexpected pointer capture loss / pointercancel / pagehide / blur / visibility change / orientation change / pause / restart / level switch / win-loss:** clear preview, timers, pointer ownership and scheduled UI updates; never queue phantom moves.
- If a second pointer arrives, cancel preview immediately and enter the normal pinch recognizer. Do not interpret one finger lifting as release-to-tap.
- If the game is `animating`, `won` or `lost`, the hold/tap engine gate remains authoritative; don't preview stale arrows.
- Provide keyboard-accessible equivalent: focused/selected arrow can show the same lane preview by a clearly documented keyboard command or accessible control; `Enter`/`Space` remains the actual attempt. Announce preview state briefly via an accessible live region without flooding it per frame.
- Avoid native touch selection/context menus on the canvas during a deliberate hold without breaking menus outside the game.

## C. Arrow extraction must feel fluid

Preserve the existing immutable engine `attemptMove` -> `animating` -> `completeEscape` contract. Do not remove occupancy at animation start. Keep the pending arrow engine-active; render it through the motion layer without duplicate static ghosts. Finite motion only while extracting.

- Follow the **original bent path** using accumulated segment lengths; the moving head advances along the straight exit ray, while the tail follows every original turn. Do not translate bent arrows rigidly.
- Evaluate distance-based timing with adjustable bounds. Initial design targets for visible normal motion: **300–550 ms for short v1 arrows** and **450–800 ms for longer dense arrows**, subject to human review, FPS and responsiveness. These are design targets, **not** claims about the reference app's timings.
- Use easing that remains legible: slight acceleration and natural finish, without abrupt disappearance or a multi-second stall. Keep motion continuous at screen edges.
- Add restrained selected-arrow emphasis and very brief success accent, avoiding large glow or clutter.
- For an invalid blocked tap: gentle 120–200 ms denial feedback with the **actual first blocker** indicated, and preserve exact Challenge/Zen heart semantics. No penalty for holding, releasing, dragging or tapping empty space.
- Under `prefers-reduced-motion`, preserve immediate/crossfade or short static feedback, never force full travel; explain in QA why the reduced-motion case appears different. Sound is governed separately by sound settings.
- Exactly-once completion is mandatory. Use existing run/escape tokens and cancellable driver; a stale callback after restart/switch/pause/blur must never remove an arrow or play a late success effect.

## D. Progressive dots on the vacated path

When an arrow is extracting, show **small, original, subtle dots** at grid centers or path-sampled points it has already vacated. This is an effect-only layer, not a level object, obstacle, selectable item or save record.

Geometry principle: represent the arrow's source path by monotonically increasing arc-length values `s` along its original tail-to-head centerline. At animation progress/traveled arc length `t`, reveal a dot only after the departing **tail** has passed that source point (e.g. `s <= t` with a small threshold). The dotted trace should progressively appear behind the departing arrow, rather than popping in all at once or occupying regions still covered by the moving body.

- Render dots behind active arrow artwork, with modest opacity and radius scaled to the grid/zoom and device density.
- Keep dots inside the safe visible board, correctly transformed by zoom/pan/rotation/resize.
- Dots can fade out within approximately **350–700 ms** following extraction; choose a clean end state. Do not leave permanent dots on completed levels unless explicitly approved.
- Cancel/clear dot effects on restart, level switch, pause, app background, unmount and cancelled extraction; no memory or RAF leaks.
- Precompute relevant source positions; do not rebuild the whole solver, scan every board arrow per dot, or run a permanent animation loop for dots.
- Make visual distinction clear: dotted traces must not look like remaining arrows or potential tap targets.
- Reduced-motion mode can show a brief non-moving exit confirmation without an extended dot animation.

## E. Minimal original sound and optional haptic feedback

Implement a **small Phase 5 slice now** because motion without feedback is not satisfying; defer full soundtrack/themes and monetization. No downloaded or copied reference audio.

Use Web Audio API synthesizing original sounds on a user-initiated interaction, or package wholly original assets with proven rights if synthesis is unsuitable. Respect existing persisted sound/haptics settings.

Required events:
1. Successful tap/launch: soft click/pluck.
2. Extraction movement: short airy swish, timed with animation rather than a delayed afterthought; long dense exits should not loop loudly.
3. Trail/dot moment: optional extremely subtle texture (avoid playing one sound per dot).
4. Blocked move: muted, low-volume wooden click distinct from success.
5. Victory: small original pleasant confirmation phrase; no loud intrusive fanfare.

Hold begin/end should be quiet or nearly silent; **release must not trigger a launch sound**. Keep audio optional, volume safe, avoid multiple AudioContexts, release/suspend audio resources, handle autoplay restrictions and unavailable audio gracefully, and do not play audio from stale animation callbacks. Haptics should be subtle and only if enabled/supported (e.g. successful start, blocked contact, victory); do not force a new native dependency if the app can safely use an existing supported capability. Settings UI must not falsely claim unsupported feedback.

## F. Keep product/domain separation

- Do not change `rules.ts`, `state.ts`, solver semantics, procedural-v1 or dense-v2 geometry recipes, canonical seeded references, level IDs or difficulty models for cosmetic effects.
- Preserve `flowline.progress.v1` and stored settings compatibility. If adding a motion preference, version/migrate safely and preserve older saved toggles. No automatic saved-progress migration.
- Prefer shared input/render/audio modules for both production gameplay and the isolated dense research lab; document any deliberate lab-only QA override.
- Keep the shipping UI full-screen/mobile-first with compact HUD and floating controls. Do not return to large permanent buttons or instructions.
- Dense research remains outside the shipping bundle. Existing v1 campaign/save boundaries remain intact.

## G. Required automated tests

Add strong regression tests without weakening the existing **1,474-test** baseline:

- Quick tap on a free arrow produces exactly one attempt and exactly one completion; blocked tap exactly one attempt and Challenge penalty.
- Hold threshold and release: **zero attempts, zero heart losses, zero move increments, zero saved history changes**.
- Hold on a blocked arrow accurately shows the real first-blocker lane, but consumes no heart.
- Start hold then pan/pinch/second pointer/pointercancel/lost capture/blur/pause/restart/level switch: clears preview and prevents delayed tap.
- Synthetic click following hold is suppressed.
- Keyboard preview is accessible; Enter still attempts.
- Dots appear in source-path order only **after** the tail passes their positions; none appear ahead of tail, none are hit targets; straight and 90°/multi-bend cases.
- A moving bent arrow follows its original centerline and exits its forward head ray, not rigid translation.
- Normal motion has a bounded finite frame lifecycle; reduced-motion alternative completes exactly once without stale timers or ghost dots.
- Restart/pause during motion cancels dots, audio, RAF and stale completion; state and persisted run remain correct.
- Sounds fire on the right semantic events, obey mute/unsupported API, and never fire on hold release or stale callbacks.
- QA at both original 7-path v1 Level 11 and dense 44/66/85-path samples; preserve all existing generator test vectors and success/failure reference seeds.

## H. Browser/device visual verification: REQUIRED, not just unit tests

Capture actual **multi-frame footage** (or timestamped frames plus a short screen recording) of the **same** long bent arrow as it exits, demonstrating:
- initial stationary full path
- head moving through the exit lane
- tail negotiating at least two bends
- dotted vacated path appearing progressively
- completion and dot fade

Also capture **press/hold**, **forward-lane ruler highlight**, and **release to unchanged board** with zero gameplay counters altered.

Perform in 390×844 and 320×568 portrait; verify 844×390 landscape. Include a dense A 44-arrow case and, if time permits, B 66-arrow case. Verify at zoomed working view; check readability and visual emphasis. If OS forces reduced motion, use the explicitly isolated QA full-motion mode and **do not claim the production default was observed in full motion**.

Check audio with actual user interaction in a browser where the AudioContext can resume. Any unavailable physical-device test, muted browser, or audio-output verification limitation must be disclosed. Browser test automation does not establish actual audible quality or Android haptic strength. Performance: count/inspect frame gaps, CPU Canvas draw cost, input responsiveness and idle scheduling; separate desktop evidence from Android claims.

## I. Completion gates and handoff

Run and report real results of:
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run android:sync`
- browser interaction testing and verified screenshots/recordings.

Do **not** claim an APK exists until a native Gradle build succeeds. The current project lacks Java 21/Android SDK setup; that blocker is unrelated to motion coding but must remain in the report.

Create `docs/PHASE_04_7_HANDOFF.md`, including:
- root-cause diagnosis of the originally invisible/insufficient motion
- exact interaction state machine and preview behavior
- trajectory/trail algorithm and audio design
- changed files and preserved critical files/fixtures
- all tests and measured visual checks
- links to **actual** annotated motion/hold evidence
- accessibility and reduced-motion behavior
- known gaps/limitations and next recommended step.

**Stop after Phase 4.7. Do not implement more Dense v2 generation revisions, broader Phase 5 audio themes, campaigns, save migration, paid features, new ads, commits, pushes or deployments.**
