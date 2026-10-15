# FLOWLINE — Phase 04 handoff

Date: 15 October 2026 (Asia/Karachi). Implementation and initial browser checks began on 14 October.

## Delivered

FLOWLINE now plays real curated and deterministic generated puzzles through the existing immutable engine. Home offers Play/Continue and Challenge/Zen; gameplay includes measured difficulty, hearts in Challenge, escaped counts, actual path targeting, snake extraction, bounded zoom/pan, restart, victory/defeat actions and saved-run restoration. The previous artwork remains a distinctly labelled, non-interactive preview.

Read the blueprint, complete Phase 4 prompt, preceding handoffs and actual engine, generation, rendering, UI, storage and tests. The newer Phase 4 specification controls scope. No generator recipe, seed mapping, reference fixture, collision rule or engine transition was changed. No dependencies, native source changes, audio/haptic synthesis, hint/hold-preview feature, Phase 5 work, commit, push or deployment were introduced.

Initial Git status already contained modified README and the untracked application/native/specification files. These were preserved. Git inspection used a command-scoped ownership exception. SHA-256 verification confirms **62 protected pre-existing files remain byte-identical**, including all existing game modules/tests/fixtures, packages/lockfile, pure settings storage, preview artwork, previous handoffs/verification artifacts and tracked-by-search Android source. See `verification/PHASE_04_PRESERVATION.json`. The intentional existing-source edits are `src/main.ts`, `src/styles.css` and `src/ui/settings.ts`.

## Files

| File | Responsibility |
| --- | --- |
| `src/gameplay/session.ts` | Loading/failure state, immutable engine orchestration, committed snapshot, replay, progression and cancellation tokens. |
| `src/graphics/game-board.ts` | Actual GameState renderer, Canvas/input adapter, clipping, DPR/resize observation, keyboard selection and finite visual effects. |
| `src/graphics/animation.ts` | Arc-length curve sampling/window extraction and cancellable, exactly-once RAF driver. |
| `src/graphics/viewport.ts` | Invertible world/CSS transforms, anchored zoom and bounded pan. |
| `src/input/hit.ts` | Segment-distance nearest path selection with stable ties. |
| `src/input/gestures.ts` | Pointer-neutral tap/drag/pinch recognizer and post-pinch pan. |
| `src/storage/progress.ts` | Versioned defensive save decoding, recipe identity, bounded history and legal engine replay. |
| `src/main.ts` | Playable screen flow, real level provider, HUD, native result dialogs and lifecycle/settings integration. |
| `src/styles.css` | Responsive gameplay layout, controls, focus, result/loading panels and existing visual tokens. |
| `src/ui/settings.ts` | Existing preference persistence plus effective OS/user reduced-motion notifications and opening interruption. |
| `src/tests/interaction.test.ts` | Fit/inverse/DPR, hit accuracy/ties/gaps and gesture tests. |
| `src/tests/extraction.test.ts` | Straight/bent/multiple-bend snake geometry, cardinal exits and finite frame lifecycle. |
| `src/tests/progress.test.ts` | Schema, replay, corruption, limits, independent fields and storage failures. |
| `src/tests/session.test.ts` | Real engine integration, terminal states, interruption, next/restart, restoration and typed load failures. |
| `src/tests/game-board.test.ts` | Canvas/browser ports, real-level rendering, pointer capture, zoomed targeting, cleanup and binding regression. |
| `src/tests/fixtures/storage.ts` | Test-only in-memory storage port. |

The original passive `graphics/render.ts`/`geometry.ts` and their preview behavior remain intact. No test fixture is imported into the production app.

## Screen flow and controls

1. Home shows current/unlocked level and Challenge/Zen choice. Continue restores the selected run; choosing another mode starts that puzzle in the chosen mode on entry. Selecting a mode never mutates an existing GameState.
2. Play shows an intentional preparation panel, disables attempts and schedules level retrieval in a separate task. `getLevel` supplies the original authored Levels 1–10 or the unchanged procedural-v1 recipe for later levels. The HUD uses the returned analysis tier/score, including any requested/measured mismatch.
3. Tap/click a path. Its head lane determines the result through `attemptMove`. A blocked attempt flashes the attempted path and actual first blocker, names both by board order, commits the mistake immediately and updates Challenge hearts. Zen has no heart penalty or heart-based loss.
4. A clear attempt enters animating with the pending arrow still active/occupied. It completes only through the current animation's `completeEscape` callback. Further attempts are engine-gated during extraction.
5. Win offers Next level, Replay and Home. Loss offers Restart, Try in Zen and Home. These are genuine engine terminal states; Next cannot unlock from animation start. Result dialogs keep actions keyboard-accessible and cannot be dismissed into an unusable terminal board with Escape.
6. Restart restores identical level geometry/seed, clears attempts and resets the view. It remains available during extraction. Home, settings, blur, pagehide, visibility loss, resize/DPR interruption and HMR invalidate pending work. An interrupted extraction returns to the last committed snapshot.
7. Pinch or use +/− to zoom, wheel over the board for anchored zoom, drag to pan when zoomed, and Reset view to return to fit. Canvas alone has `touch-action: none`; page scrolling elsewhere remains available. HTML controls have at least 44px touch targets.
8. Focus the Canvas and use arrow keys to cycle actual active paths; direction/selection is announced, and Enter/Space attempts that path. Ordinary buttons retain native keyboard focus behavior.
9. View art preview/Back still works separately. Settings preserves its original storage format and Escape/focus restoration. Sound/haptics remain truthful stored preferences for a later phase. No placeholder Hint or hold-preview button is shipped.

## Targeting and view geometry

Grid centers are fit into the actual CSS canvas rectangle with preserved aspect ratio. Zoom is applied around the rectangle center, followed by a CSS pan offset. `boardTransform` exposes the exact inverse. Backing pixel sizes are separately rounded from CSS size × DPR, and the context transform uses the actual backing/CSS ratios; pointer input never multiplies by DPR.

Hit testing measures a point's clamped projection onto **every segment** of each active tail-to-head path. The nearest candidate within a tuned 8–14 CSS-pixel radius wins; exact ties retain original Level order. Removed paths and empty bend bounding-box corners are excluded. Rendering rounds corners without changing frozen domain cells.

Movement over 8 CSS pixels permanently suppresses a tap for that gesture, even when returning to the start. Multiple pointers suppress taps immediately. Pinch uses incremental distance and midpoint anchoring; the remaining finger may continue panning after the other is released. Expected `lostpointercapture` after pointerup is distinguished from unexpected capture loss. Cancellation cannot turn into a tap. Zoom is clamped to 1–4×; pan is bounded to half the CSS viewport size × (zoom−1), keeping reset/recovery reliable.

## Snake extraction and lifecycle

The ordered tail-to-head centers form a continuous polyline with cumulative arc lengths and original length L. A straight cardinal ray extends the head beyond the current viewport. At travel t, `curveWindow` draws the portion from t through t+L. Interpolated endpoints and retained intervening vertices keep the tail on its original centerline while the head advances outward. This is not rigid translation of a bent path. A viewport clip contains the departure, and the final travel includes enough margin for the whole tail to leave.

Normal durations are 258–378ms for the shipped 2–7-cell paths (the driver bounds duration to 180–450ms), with smoothstep easing. The renderer owns its moving geometry; the engine's frozen level coordinates remain untouched.

Two independent guards protect completion: `EscapeAnimator` invalidates queued RAF tokens, and `GameSession` checks a run/escape token against the current pending state. Duplicate/stale callbacks cannot remove an arrow from a restarted/new puzzle. Effective reduced motion is the stored preference **OR** OS preference. It settles the current extraction exactly once, cancels the old RAF and still commits through the engine. Opening Settings interrupts uncommitted animation; an OS reduced-motion change can settle it directly.

Idle rendering is event-driven. There is no perpetual game RAF: resize/DPR requests coalesce, animation schedules only while active, and blocked feedback uses one bounded timer. Hover without captured input does not redraw. Disposal aborts listeners, observers, media queries, timers and frames. Generation is outside pointer handlers and RAF: the UI provider defers bounded retrieval by 30ms to show loading first. This is deferred main-thread generation, not a Web Worker; a started synchronous generation cannot be preempted, but stale results are ignored.

## Offline save contract

Key: **`flowline.progress.v1`**, separate from unchanged `flowline.settings.v1`.

```ts
{
  version: 1,
  highestUnlocked: number, // positive uint32 level number
  mode: 'challenge' | 'zen',
  run: null | {
    number: number,
    identity: string, // level-v1 + level ID/seed + geometry fingerprint
    mode: 'challenge' | 'zen',
    history: Array<{
      arrowId: string,
      outcome: 'blocked' | 'exiting',
      count: number
    }>
  }
}
```

Only committed operations enter history. Blocks save immediately. Successful attempts save after `completeEscape`, never at animation start. No Sets, coordinates, serialized mutable GameStates, pending IDs or animation payloads are saved. Closing mid-extraction restores the preceding committed state, including prior penalties.

Startup regenerates the same numbered level, compares recipe/ID/seed/geometry identity, then replays each operation through `attemptMove` and, for successful exits, `completeEscape`. Unknown/inactive IDs, wrong recorded outcomes, attempts after terminal state and stale identities reject the run. Parsed independent valid unlock/mode fields survive invalid/unsupported run data. Unreadable JSON or oversized envelopes safely default. Denied/quota reads/writes are caught and show a nonblocking session-only notice; gameplay continues.

History has limits of 256 encoded records and 4,096 replayed attempts, with consecutive blocked attempts compressed into counts. Envelope size and identifier/count ranges are checked before replay. **Deliberate safeguard:** an unusually long run exceeding either limit stops saving that run, drops its checkpoint and explicitly tells the player; unlocked levels/mode still save and in-memory play continues. Restart restores normal run saving. Reload after this safeguard starts a fresh available level rather than pretending to restore an incomplete checkpoint. This rare limit is a documented restoration limitation, not an unbounded history.

LocalStorage persists normal refresh/reopen on the same origin/WebView. Clearing site/app data removes it; uninstall durability is not claimed. Assets and game logic have no network dependency once loaded/bundled. No service worker or web offline-install/cache promise was added; the local HTTP preview still requires its server, and a packaged Capacitor app will carry the synchronized assets.

## Executed verification

| Check | Actual result |
| --- | --- |
| Pre-change baseline | **PASS: 1,205 tests / 10 files**, 18.91s, before substantive edits. |
| `npm run typecheck` | **PASS, exit 0**, including final sources/tests. Production/sync builds also execute strict `tsc --noEmit`. |
| Final `npm run test` | **PASS: 1,315 tests / 15 files**, exit 0, **24.84s**. All original 1,205 remain; 110 gameplay cases were added. |
| Deterministic seed regression | **1,000 generated, 1,000 verified, zero failures** across all four profiles. Original vectors/fixture unchanged. Latest raw sample: `verification/PHASE_04_SEED_REGRESSION.json`. |
| `npm run build` | **PASS** as standalone checks and final sync prerequisite; final output transforms 24 modules, build 112ms. |
| `npm run android:sync` | **PASS, exit 0**; final Capacitor synchronization 0.405s, Android plugin update/copy succeeds. |
| Production/native asset hashes | **PASS: all 4 files match** under `dist` and `android/app/src/main/assets/public`. |
| Protected-file hashes | **PASS: 62/62 byte-identical**, zero protected changes. |
| Domain independence | Existing `src/game` modules remain unchanged and contain no document/window/localStorage/RAF integration. |
| Native APK | **Not built**; Java 21/Android SDK toolchain remains unavailable. Sync is not compilation. |

Final production sizes: HTML **0.67kB** (gzip 0.39), CSS **16.44kB** (gzip 3.86), JS **54.09kB** (gzip 18.84). Final bundle: `index-DWpJU3ew.js`; CSS `index-DPacMlwU.css`. Dependencies and lockfile are unchanged. After the full regression run, the art Canvas fallback copy was corrected to point to Play; the final build/typecheck/sync include that copy-only correction.

The existing seed test writes Phase 3 report files automatically. Their original bytes were backed up before the baseline and restored after verification; the final rerun's measurements were copied to the new Phase 4 regression artifact. Previous verification records were preserved rather than relabelled.

Tests cover CSS/backing/inverse transforms and resize, real Levels 1/4/10/11/81 at multiple sizes, path gaps/ties/endpoints, tap/pan/pinch/cancel/capture release, full snake length through 90°/multiple bends and all cardinal exits, queued stale frames, duplicate completion, reduced-motion start/toggle, pending occupancy, both modes/loss, restart/next, mid-animation save boundaries, corrupt/unsupported/stale/outcome-invalid saves, quota, bounded Zen retries and typed/exception/asynchronous loading failures. The Canvas port tests assert native RAF receiver binding, cleanup, no idle frames and actual-path interaction under transformed views.

## Hands-on production browser record

The browser tools exercised actual HTML controls, mouse clicks/drags and Canvas keyboard inputs against the production build at `http://127.0.0.1:4173/`; no API fabricated move outcomes or unlocked progress.

- Mouse-clicked the free Level 1 path and observed a genuine victory. Three mouse attempts on Level 2's blocked lead path consumed three Challenge hearts and produced defeat. Try in Zen restarted the same geometry, hid hearts and allowed blocked retries.
- Reloaded partial Level 2 after removing its gate; Continue restored 1/2 escaped and Zen mode through legal replay. Settings changes survived reload; Escape restored Settings-button focus. Sound and reduced motion were tested and restored to their original values; haptics remained unchanged.
- Mouse drag at fit did not attempt a path. Zoom +/−, zoomed mouse pan and Reset view worked. Mouse-clicked the Level 4 gate and bent arrow in landscape. Restart after attempts restored all original paths.
- Actually completed onboarding Levels 1–10 through the UI. Later levels used Zen keyboard cycling to exercise both blocked/safe results, not an optimal solution script. Level 10 completed in 40 attempts. Entered the real generated Level 11 (7 paths, measured easy 41.96), won it in 15 UI attempts and replayed it. Its genuine completion unlocked Level 12.
- Generated gameplay and controls were exercised at **320×568, 390×844, 430×932, 844×390 and 1024×768**. Raw rectangles/scroll sizes are in `verification/PHASE_04_BROWSER_LAYOUTS.json`. No horizontal page overflow was observed. Content can scroll vertically on short/desktop layouts; on the generated 320px case the document was 577px tall, and controls remained visible. The 390/430 portrait and landscape layouts fit their viewport heights.
- Final fresh production tab captured **zero console warnings/errors**. An earlier development build exposed an illegal-invocation RAF receiver error; it was fixed with window-bound wrappers and protected by a Canvas regression test. The initial stopped preview/server and stale browser-tab issues were resolved; they were not reported as successful launches.
- Renderer diagnostic counters stayed at **8 draws over 137,018ms idle**, measured before the last pointer-capture-only patch; that patch does not add scheduling. Sample actual desktop-browser JS Canvas draw calls were about **0.1–0.8ms** on Levels 10/11. These timings exclude GPU/compositor cost and do not establish Android FPS. Diagnostics are bounded scalar `data-*` values on the Canvas, not persisted gameplay or growing samples.

**Important verification boundary:** the host browser's OS reduced-motion preference was effective even with the stored toggle off (root effective motion remained true; one settle frame). Live gameplay therefore exercised immediate, correct extraction completion. Full normal-motion curve frames, timing and cancellation are covered by automated geometry/clock/Canvas tests; **normal-motion appearance was not visually validated in this browser**. The browser exposed no reduced-motion emulation override. No OS preference was overridden to obtain an animation claim.

Physical touchscreen/multitouch injection, Android WebView/device lifecycle/system bars, low-end performance and hardware Back were not available. Pinch and post-pinch pan are implemented and automated-tested, not claimed physically tested. Expert Level 81 is verified through real data, fit/hit/render/session tests; it was not browser-played. The QA origin now contains real progression through Level 11, with Level 11 replay ready in Challenge; temporary viewport overrides were reset.

## Screenshots and evidence

New files under `docs/verification/`:

- `phase04-generated-challenge-390.jpg` — actual playable generated board, Challenge HUD and controls.
- `phase04-generated-victory.jpg` — genuine Level 11 victory, captured after the compositor painted the modal.
- `phase04-generated-desktop-1024.jpg` — generated board on desktop; vertical scrolling is available for lower controls.
- `phase04-level10-430.jpg` — dense curated board on a phone.
- `phase04-play-320.jpg`, `phase04-play-390.jpg`, `phase04-bent-430.jpg` — responsive bent-arrow play.
- `phase04-landscape-844.jpg` — side-by-side landscape controls and board.
- `phase04-victory-320.jpg`, `phase04-defeat-320.jpg` — real terminal states.
- `phase04-bent-cleared.jpg` — post-extraction state, **not** a normal-motion animation frame.
- `PHASE_04_BROWSER_CHECKS.json`, `PHASE_04_BROWSER_LAYOUTS.json`, `PHASE_04_PRESERVATION.json`, `PHASE_04_SEED_REGRESSION.json` — measured verification records.

## Launch, remaining limits and next-phase readiness

```powershell
npm run dev            # http://127.0.0.1:5173
npm run test
npm run typecheck
npm run build
npm run preview        # http://127.0.0.1:4173
npm run android:sync
```

A hidden local production preview process was used for browser QA. It is local serving, not deployment.

Java still reports **1.8.0_51**. `JAVA_HOME`, `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset; `adb` is not available. Standard Android Studio/SDK locations were checked. The existing Capacitor Android project requires Java 21 and Android SDK configuration. No native toolchain was installed and no debug APK exists at `android/app/build/outputs/apk/debug/app-debug.apk`. Actual Gradle/APK/device verification remains blocked.

No known failing implemented gameplay tests remain. The production browser experience, deterministic progression and preserved domain APIs are ready for the next approved phase. Before a device release, verify normal-motion extraction visually, real pinch/touch accuracy, Android lifecycle/Back, safe areas and measured device frame times. Consider a worker only if measured generation/loading on target hardware warrants it; version any future generator change rather than changing saved recipes silently.

Audio/music/haptic synthesis, advanced effects/themes, visual hints, hold-preview and further product polish remain deferred. Phase 5 has not begun. **No commit, push or deployment occurred.**
