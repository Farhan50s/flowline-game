# FLOWLINE — One-Day Game Design & Engineering Blueprint

**Status:** working concept / original game, inspired by the arrow-extraction puzzle genre. **Goal:** a polished, testable offline mobile-first web game, optionally packaged as an Android APK. **Constraint:** 1 focused development day, assisted by a coding agent. **Not in scope:** shipping through Google Play in a day, backend, payments, ads, cloned levels, original publisher's artwork or audio.

## 1. Competitive research (October 14, 2026)

Reference: **Arrows – Puzzle Escape**, Lessmore GmbH, Android package `com.ecffri.arrows`, on Google Play and iOS. The official Google Play page lists 100M+ downloads and ~2 million reviews; features include thousands of levels, hints, no timers, offline gameplay and ads/in-app purchases. Reference links:
- https://play.google.com/store/apps/details?id=com.ecffri.arrows
- https://apps.apple.com/pk/app/arrows-puzzle-escape/id6748397500
- Gameplay video (levels 1–10; labelled no music): https://www.youtube.com/watch?v=wOowHTKRSBM
- Rules and community prototype: https://github.com/JasonDistler/arrows-escape-web (separate community implementation, **not official game code**)

### Confirmed or consistently described base gameplay
- A board of many connected **bent or straight arrow paths**, not just isolated arrow icons.
- Tap a path and it attempts to escape in the direction indicated by its head.
- Other paths occupying the head's escape lane block the move. Incorrect attempts cost a heart (usually 3). Successful paths disappear, unblocking further paths.
- Clear every path to win. Puzzles are untimed, and hints exist.

### Additional features with weaker verification
- Daily challenges and league features are described in app events and player posts; exact in-app behavior is not fully verified.
- App reviews mention dark mode, long-press direction preview and a satisfying short clicking sound, but the precise audio files and sound synthesis cannot be verified without directly recording gameplay.

### Player complaints and product opportunities
- Frequent ads and ads hijacking navigation.
- Dense arrows leading to accidental selection on touchscreens.
- Difficulty badges not always matching genuine logical challenge; repetitive boards.
- Some zoom/pan complaints.
Our answer: free initial version with **no forced ads**, larger forgiving touch targeting, Smart Path Preview, deterministic solvable seeds, measured difficulty tiers, and reliable viewport controls.

## 2. Product identity

Working title: **FLOWLINE** (not trademark-cleared). One-line pitch: **Unwind living lines. Find the clear route.**

- Mood: serene, clever, warm, premium, no neon or copied screenshots.
- Color tokens: warm ivory #F7F4ED, deep ink #202E36, turquoise #159C9A, coral #F16F64, pale blue-grey #DCE6E8. Add high-contrast / dark mode.
- Typeface: system sans or properly licensed open-source sans.
- Paths: softly rounded variable-length strokes, clear filled arrowheads, subtle texture/dots and easily distinguished selection halo.
- Differentiators in day-one MVP: **hold-to-preview** a collision lane + first blocker (no penalty); **Zen** (unlimited retries) and **Challenge** (three hearts); deterministic procedurally solvable puzzle seeds; adjustable audio; no forced advertising.
- Optional after MVP: daily puzzle, seed sharing, community challenge, custom level editor, richer special arrows, puzzle replay, accessibility controls.

## 3. Mechanics specification

### Data model
```
type GridPoint = { x: number; y: number };
type Direction = 'up'|'right'|'down'|'left';
type ArrowPath = {
  id: string;
  // Connected orthogonal cell-center coordinates in order TAIL -> HEAD.
  cells: GridPoint[];
  direction: Direction; // outward direction at HEAD
  variant?: 'standard';
};
type Level = {
  id: string;
  seed: number;
  width: number;
  height: number;
  arrows: ArrowPath[];
  difficulty: 'easy'|'medium'|'hard'|'expert';
};
type GameState = {
  level: Level;
  activeArrowIds: Set<string>;
  hearts: number;
  mode: 'zen'|'challenge';
  moves: number;
  mistakes: number;
  phase: 'ready'|'animating'|'won'|'lost';
};
```

### Validation/invariants
- Cells are integer grid coordinates, inside the board, pairwise distinct across all paths, and each path's next cell is orthogonally adjacent.
- No arrow self-intersection. Last body segment must face the indicated arrowhead direction.
- For any tapped arrow, scan cells from `head + direction` until the board edge; any occupancy by **another active arrow** is the **first blocker**. Do not check only adjacent cell.
- Invalid attempt: no arrow removed; flash attempted arrow and its blocker; 1 heart lost only in Challenge, no penalty in Zen; no double firing during animation; avoid tapping ambiguity.
- Valid attempt: animate path extraction along the tip's route, with trailing body following its original bends and then retracting until fully off-board. Only then commit removal (or commit in state and keep visual ghost until animation finishes). Do **not** naively translate the whole bent path horizontally through occupied cells while collision logic only checks the tip; that creates mismatched visuals and rules.
- When active arrow count is zero, transition to win, save progress and start next level on action (optionally automatic after short delay).
- In Challenge, on reaching zero hearts offer Restart. Restart restores identical seed and all paths.
- Hint: highlight one currently safe arrow. If there are no safe arrows, show a clear error and log invalid level; valid generated levels must never deadlock.
- Hold-to-preview must not count as a tap, nor should dragging/pinching.

### Safe move rule pseudocode
```
function blockerFor(arrow, occupancy, width, height) {
  let p = arrow.cells[arrow.cells.length - 1];
  const d = vectorFor(arrow.direction);
  for (let x = p.x + d.x, y = p.y + d.y;
       x >= 0 && x < width && y >= 0 && y < height;
       x += d.x, y += d.y) {
    const ownerId = occupancy.get(`${x},${y}`);
    if (ownerId && ownerId !== arrow.id) return ownerId;
  }
  return null;
}
```

### Seeded level generator (most important)
- Use a seeded PRNG. Generate arrows by **reverse construction**. Begin with an empty board, repeatedly propose a new tail-to-head orthogonal non-overlapping path of 2–7 cells and 0–3 bends. Require that its **forward head ray is clear of previously placed arrows** before accepting.
- Since the newly placed arrow is free relative to existing arrows, reversing the placement order always yields a valid solution. Save this witness solution and run a solver in tests.
- Reject bland candidates with too few blocking dependencies, overly sparse occupancy, all initial moves free, isolated paths, or massive indistinguishable clusters.
- Measure difficulty using occupancy, arrow count, average bends, initial safe-arrow count, dependency-chain depth, and forced-move ratio. Difficulty should not be assigned merely by level number or visual density.
- Define a deterministic series of seeds, so Level N yields the same level on every restart and device.
- For day one, ship **10 hand-curated onboarding levels** (original designs) and generated seeds for Levels 11+ after automated verification. The generator can create many levels but do not promise every generated puzzle is fun; sample and inspect.
- Check every generated level for valid geometry and full completion using the witness sequence; property-test hundreds to thousands of seeds.

## 4. User interface and controls

**Screens:** Home / Tutorial / Game / Level complete / Settings / Level selector. Prefer an overlay over excessive navigation.

**Game HUD:** level and difficulty at top, 3 heart icons only in Challenge, settings icon, central viewport with paths, bottom controls Hint, Restart, Center and Zen/Challenge selection in settings. No timers. A simple progress count `cleared / total` is useful.

**Mobile:** portrait-first, responsive landscape/tablet support, safe-area insets, touch target >= 44 CSS px for controls, tappable curved strokes using point-to-segment proximity / grid-occupancy hit-testing with sensible pixel tolerance. Near two lines, show selection preview rather than charging an accidental hit. Pointer movement threshold before turning a press into a pan.

**Viewport:** one-finger drag/pan, two-finger pinch/zoom anchored at gesture center, double-tap or Center button to reset, clamp zoom/offset to keep board recoverable. Constrain frame time and avoid rerendering all static board graphics needlessly.

**Accessibility:** sound/haptics toggles; reduced-motion option; high-contrast color mode; no color-only signaling; scalable HUD; buttons with accessible labels; no timer requirement.

## 5. Animation plan

- Idle: calm static paths, almost invisible breathing pulse on highlighted arrows only.
- On valid tap: subtle 50–80 ms anticipation; head accelerates forward; body follows the path; trail thins and fades; entire effect 180–350 ms (based on arrow length), smooth easing.
- On blocked tap: short 120–180 ms red/coral pulse on the arrow and blocker, a tiny non-jarring shake, no large screen shake.
- Hint: 400–700 ms teal pulse around an actually safe arrow.
- Victory: ~0.6–1.0 s soft confetti/geometry bloom, readable Next button and quick transition.
- Settings: reduced motion replaces translations with simple opacity changes.

## 6. Original audio specification (do not rip or imitate copyrighted game sounds)

**Evidence:** player reviews like the original's clicking sound and effects; one review describes a former sound as 'tia tia tia', but exact frequencies, source audio, settings and timing are **not verified**. We should design our own.

| Event | New sound design | Approx. duration |
|---|---|---|
| Selection | Soft wooden/glass `tik`, quiet high-mid transient | 25–60 ms |
| Safe exit | Light air swoosh + ascending pluck/ping | 110–240 ms |
| Block/collision | Muted woody `tok` with short low component, NOT a harsh buzzer | 100–170 ms |
| Hint | Transparent 2-note glass chime | 180–350 ms |
| Win | Gentle 3–4-note pentatonic melodic flourish | 400–850 ms |
| Button | Very soft interface click | 20–50 ms |
| Optional ambient | Quiet non-repeating pad, fully muteable, **off by default** | Continuous |

Use Web Audio oscillators/noise and ADSR envelopes or original/appropriately licensed recorded one-shots. Initialize/resume audio context only after user gesture, handle Android/WebView audio restrictions, throttle repeated SFX, use a tiny bit of pitch variation, and provide **SFX On/Off**, **Music On/Off**, and level sliders if time. Haptic taps optional; never vibrate while sound is muted unless haptics enabled separately.

## 7. Recommended implementation

**Fastest for this project:** TypeScript + Vite + HTML Canvas 2D + CSS for HUD/menus + Web Audio API, packaged using Capacitor for Android. Phaser is another supported option if the agent/team is more comfortable with it, but avoid unnecessary physics/scene complexity for a grid-and-path puzzle. All rules, generator and state should be pure, renderer-independent TypeScript functions; no backend.

Suggested structure:
```
src/
  main.ts
  game/types.ts
  game/rules.ts
  game/generator.ts
  game/solver.ts
  game/state.ts
  game/levels.ts
  graphics/render.ts
  graphics/animation.ts
  input/pointer.ts
  audio/sfx.ts
  ui/overlays.ts
  ui/settings.ts
  storage/progress.ts
  styles.css
  tests/rules.test.ts
  tests/generator.test.ts
```

**Web**: `npm create vite@latest flowline -- --template vanilla-ts`, implement and `npm run dev`. **Android** (if Android Studio/SDK are installed): install `@capacitor/core @capacitor/cli @capacitor/android`, `npx cap init`, confirm `webDir=dist`, run `npm run build`, `npx cap add android`, `npx cap sync android`, `npx cap open android`, build debug APK with Android Studio. Packaging and QA take additional time and a Play Store public release is **not** a one-day promise. See https://capacitorjs.com/docs/getting-started.

## 8. Day-one implementation schedule (10 productive hours)

| Time | Goal | Evidence / stop condition |
|---|---|---|
| 0:00–0:45 | Create repo, minimal design tokens, types | App launches in browser |
| 0:45–2:45 | Core geometry, collision, state, tests | Straight and bent arrow cases pass |
| 2:45–4:30 | Reverse-construction level generation and solver | Hundreds of seeds pass validator |
| 4:30–6:00 | Draw paths and animate departures | Touch a safe path, see convincing motion |
| 6:00–7:00 | UI, hearts, hints, Zen/Challenge, persistence | Full play-reset-win cycle works |
| 7:00–7:45 | Original sound + subtle effects | Every action has optional restrained feedback |
| 7:45–8:45 | Touch, pan/zoom, onboarding, visual polish | Functional on a physical smartphone |
| 8:45–10:00 | Regression tests + packaging if SDK ready | Browser build stable; Android debug APK where feasible |

**Cut in this order if behind:** ambient music -> fancy win VFX -> zoom gestures (keep zoom buttons) -> daily challenge -> APK packaging. **Never cut:** correct collision logic, solvable levels, responsive tapping, readable arrows, and state saving.

## 9. Acceptance tests

- An arrow pointing at open edge escapes correctly.
- Same row with another arrow between head and exit: blocked, heart decreases only in Challenge, first blocker highlights, neither path removed.
- Another arrow elsewhere in the board does not block incorrectly.
- Curved arrow's **head lane** is used; no collision false positives from unrelated body segments.
- 10 or more generated puzzles manually played and 1,000 generated seeds validated by algorithm.
- Restart uses identical seed; saved progression survives refresh, and settings persist.
- Holding to preview NEVER triggers an extraction or heart penalty.
- Dragging or pinching NEVER triggers an accidental tap.
- Success feedback, blocked feedback, hint and win effects work with sound ON and OFF.
- Portrait small screens, landscape, tablet and basic keyboard play remain usable.
- 60 fps target on a mid-range phone, no unbounded arrays/timers or memory leak through repeated restarts.

## 10. Master prompt for an AI coding agent

> You are a senior TypeScript game engineer, UX designer and QA engineer. Build the game specified in `FLOWLINE_ONE_DAY_GAME_BLUEPRINT.md` as an original, polished, offline, mobile-first arrow-extraction logic puzzle. Use a minimal Vite + TypeScript + Canvas 2D + CSS + Web Audio stack. Prioritize working software over explanation. Implement pure puzzle rules and seeded reverse-construction generation first; create automated tests proving validity and guaranteed solvability; then rendering, input and UI; then original SFX, performance and responsive QA. Never copy the reference app's name, code, level data, visual art or audio. Make the arrow paths smooth and bent, and make the extraction animation faithfully follow the path rather than rigidly translating a bent sprite. Use production-readable code, modular structure and accessible controls. Add 10 curated tutorial levels, Zen and Challenge modes, hints, safe-path preview, progress persistence, pause/settings, and an original visual system. Audit touch confusion, real physical Android devices and low-end performance. Do not claim tests passed unless executed. At the end report what is complete, tests run, how to launch, what remains, and blockers. Ask a question only if implementation absolutely cannot proceed.

## 11. Shipping guidance

Release sequence: day-one private playable prototype -> 2–3 days of QA / level tuning -> optional Android closed test -> privacy policy and platform compliance as relevant -> Play Store submission/review. Store name and icon need an independent legal/trademark check. Never claim affiliation with Lessmore; do not duplicate exact screenshots, levels, sounds, marketing text or assets.
