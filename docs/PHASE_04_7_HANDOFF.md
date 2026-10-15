# FLOWLINE — Phase 4.7 handoff

Date: **15 October 2026**, Asia/Karachi. Status: **implemented, verified and stopped for owner review**.

## Delivered and running

Short taps make real engine attempts. A 220ms hold highlights the complete selected path and its canonical forward lane; releasing only dismisses. Normal extraction preserves the winding centerline, uses distance-based timing, reveals dots behind the departing tail, and leaves a finite fading trace. Optional original Web Audio and supported-browser vibration accompany actual launches, blocks and victory. No reference assets, new dependencies, generator revisions, save migration, commit, push, deployment or broader Phase 5 work.

- **Production:** [http://127.0.0.1:4173/](http://127.0.0.1:4173/).
- **Full-motion research lab:** [http://127.0.0.1:5173/research/dense-v2/](http://127.0.0.1:5173/research/dense-v2/).
- **Actual motion/hold gallery:** [http://127.0.0.1:5173/docs/verification/phase047/gallery.html](http://127.0.0.1:5173/docs/verification/phase047/gallery.html).

The existing local dev/preview servers remain running. A fresh production tab uses final bundle **`index-DxlKE-ft.js`**, in unsaved Level 11 Challenge practice with seven paths and three hearts. A separate lab tab has fresh A/seed 0, 44 paths, three hearts, zero attempts, and the intentional full-motion QA override enabled. Temporary viewport overrides were reset. The user's separately active campaign tab was left alone; our production interactions used practice, without campaign writes.

**This host has both system and stored reduced motion ON. Production therefore still settles immediately, intentionally.** For normal travel here, use the lab's labelled override. On a host without system reduced motion, turn off the in-game Reduced motion switch as well. No system preference or persisted toggle was silently changed.

## Diagnosis performed before changes

Inspected Git status, the complete Phase 4.7 brief, Dense feasibility and Phase 4.5/4 handoffs, blueprint, actual engine/session/storage/settings/renderer/input/lab code and tests. The repository already had modified README and the untracked project/native/spec files; that work was retained. Command-scoped Git ownership exceptions were used, without global Git configuration changes.

The existing `curveWindow` was already a correct snake extraction. Production's settings used **stored OR OS** reduced motion; the browser showed the stored switch on, and the lab's OS-only diagnostic confirmed the system preference on. Final production DOM now explicitly reports both. Reduced extraction completed in **one frame, 0ms measured travel**, through the real engine callback. This explains the apparent teleportation without a broken trajectory.

Before implementation, explicitly enabled the existing lab QA override and captured A/seed 0 arrow 021: eight cells, four turns, source arc **147.875px**, full tail travel **196.6625px**, configured legacy duration **402ms**, **26 frames**, maximum observed gap **19.1ms**. [Baseline frames/data](verification/phase047/BASELINE_MOTION.json), [stationary](verification/phase047/before-A-390.jpg), [mid-departure](verification/phase047/before-A-motion-2.jpg). The body did follow its bends. The old timing was brief, had no vacated-path feedback, and safe clipping hid the head before full Canvas departure finished. That clipping is continuous and remains intentional; it is not early engine removal.

The host cannot provide a production observation with OS reduced motion off through the available browser API. **Full-motion visual evidence is explicitly lab QA evidence**, using the same shared renderer, input, feedback service and immutable engine operations. Production full motion on a non-reduced physical device is still a review item.

An initial production-tab observation was rejected by automatic browser approval review because port 4173 had been blocked in the preceding phase. The owner explicitly approved retrying that origin. Access then succeeded, including the final production build; this is no longer an unresolved verification block.

## Pointer and keyboard contract

`BoardGesture` now coordinates the existing pan/pinch map and hold intent, rather than independent tap and hold listeners racing each other:

| State / event | Result |
| --- | --- |
| Primary down in ready safe area | Capture pointer, resolve actual visible path; schedule one adjustable 220ms timer. No attempt/audio/save. |
| Up before threshold, movement ≤8 CSS px | One real attempt. An elapsed-time guard handles delayed timers. |
| Threshold reached, still held and ready | Pure preview of a uniquely identified arrow. Empty/ambiguous long presses cannot become taps. |
| Up after hold | Clear preview/timer/capture; zero attempts, heart losses, moves, history writes or launch sounds. |
| Drag beyond 8px / second pointer | Permanently suppress tap, dismiss preview, continue the original pan/pinch behavior. |
| Cancel / unexpected capture loss / wheel / view controls / resize | Clear intent and release owned captures. No delayed action. |
| Pause / restart / switch / blur / hidden / pagehide / disposal | Cancel preview, travel, dots, effects and audio; invalidate stale completion through existing renderer/session tokens. |
| Animating / won / lost | No new hold or tap can reach the engine. |

Pointerup is the only pointer attempt path. Synthesized `click` is prevented and has no attempt handler. Native context menus/callouts/selection are suppressed on the game Canvas only. Expected capture release after pinch still preserves the remaining finger's pan.

A final input audit also covered second contacts outside the drawing safe area: an empty HUD-margin contact joins the pinch and cancels the hold immediately; a contact on a separate control clears the Canvas hold before the control handles its own action. Four regression cases cover these routes before and after the threshold.

The lane uses unchanged `traceExitLane`, `buildOccupancy` and `firstBlocker`. It displays regular ticks, a direction cue, the actual first-contact cross and coral blocker shape, then fades unreachable lane portions. No solver, hint charge or geometry mutation is involved. Existing ambiguous-contact magnify/retap and offscreen rejection remain authoritative.

Keyboard arrows select; **P** toggles the same preview; **Escape** dismisses; **Enter/Space** attempts, ignoring auto-repeat. Pause/help, hidden Canvas instructions and live announcements document the commands. Keyboard announcements say P/Escape dismisses, rather than incorrectly asking for a pointer release. No per-frame live announcements.

## Motion and progressive trail

The frozen tail-to-head centerline retains accumulated arc lengths. The fixed-length moving window is sampled at `[t, t + L]`; the head continues on its cardinal ray and the tail traverses every original bend. Pending arrows remain engine-active/occupied and are drawn through the motion layer, without a duplicate static body. Completion/removal occurs exactly once after full departure. Restart/pause does not commit an unfinished escape.

Refined production/lab gameplay uses adjustable `INTERACTIVE_TIMING`: **300–550ms** for 2–7-cell paths, **450–800ms** for longer bodies. The default formula is `260 + 22 × cellCount + 8 × travelInCells`, clamped to those bounds. Zoom changes CSS distance without artificially slowing the same path by its scale. Optional renderer timing bounds support QA tuning; no shipping timing menu was added. Existing smoothstep easing and finite driver were retained. The legacy geometry API/default timing remains compatible with its original tests; actual full-screen gameplay explicitly uses the interactive profile.

Selected/departing paths receive restrained teal emphasis. Blocks pulse for 180ms normally or short static feedback under reduced motion, marking the actual blocker. Existing finite victory bloom remains. Stale transient collision toasts are now cleared at pause/restart/terminal boundaries.

`path-effects.ts` precomputes world-space source samples every approximately half cell, capped at 1,024. A sample at source distance `s` starts revealing only after the tail passes `s + 0.16` cells; opacity ramps over another 0.24 cells. Dots draw behind arrows at modest opacity, with radius **0.9–1.65 CSS px** scaled to cell size. They are never added to the level, occupancy, hit targets or saves.

The latest completed trace fades for **500ms**. At most one active and one completed fading trace are retained; a new completion replaces older residue. Live transforms keep fading traces aligned while panning/zooming. Resize, cancellation, restart, navigation, background and disposal clear them. Reduced motion has a short confirmation, no moving dots or extended trail RAF. No idle animation loop.

## Original audio and haptics

`GameFeedback` owns one lazy AudioContext per mounted app. It is first created/resumed by a real launch/block/keyboard interaction. Original synthesis uses a quiet triangle pluck, a short filtered deterministic-noise swish timed to travel, a soft completion tone, a lower wooden block tone, and a three-note victory phrase. No downloaded/copied files, soundtrack, per-dot sound spam or new native dependency.

Launch pluck is approximately 55ms; block 115ms; completion 85ms; victory approximately 420ms. Travel noise is bounded to 650ms and approximately 85% of the visual duration. Individual voice gains are under 0.04. Hold begin/end/release is silent. Reduced motion uses brief confirmation without travel noise. Saved sound and haptics toggles remain independent.

Autoplay resume promises, pending launch revisions and cancellation tokens prevent late sound after restart/mute/disposal. Suspension is coordinated with subsequent resume. Voices are capped at 16, stopped/disconnected on cancellation, and the context suspends after finite idle cleanup; disposal closes it and prevents delayed diagnostic UI updates. Missing/denied APIs fail quietly. Optional `navigator.vibrate` requests are 7ms launch, 12ms block and a small victory pattern; enabled/supported only. Settings now truthfully describe current feedback and platform support.

The browser actually resumed audio, scheduled launch/movement/completion/block events, and returned to suspended with zero voices. A real 44-path victory recorded **`audioEvent: victory`, `audioState: running`, three voices**. Muted B85 extraction created **no AudioContext/voices**. These prove scheduling and semantics, **not audible quality, speaker output level or physical haptic strength**. Those require owner/device listening.

## Shared product and research boundaries

Production and lab both use `mountGameBoard`, `BoardGesture`, path effects and `GameFeedback`. The lab now also offers unchanged seven-path v1 Level 11 alongside v1 Level 81 and dense A/B. It reads compatible settings on its own origin; sound/haptic test overrides and the full-motion checkbox are session-only. It writes neither settings nor progress. The diagnostic explains stored/system/effective motion. Research HTML/worker/generator remain outside the shipping build.

Nine pre-existing files intentionally changed: `src/main.ts`, `src/gameplay.css`, `src/ui/settings.ts`, `src/input/gestures.ts`, `src/graphics/animation.ts`, `src/graphics/game-board.ts`, `src/research/dense-v2/{lab,worker}.ts`, and `research/dense-v2/README.md`.

New implementation/tests/tools: `src/feedback/game-feedback.ts`, `src/graphics/path-effects.ts`, `src/tests/{motion-effects,feedback,interaction-fidelity}.test.ts`, `scripts/phase047-motion-probe.mjs`, and the evidence packaging script/gallery/records under `docs/verification/phase047/`.

**225/234 checkpointed pre-existing files are byte-identical; the other nine are the intentional edits above.** All old tests/fixtures, v1 and r2 dense generators, rules/state/solver/difficulty, level identities, session, storage/schema, dependencies/lockfile, native source/config and earlier handoffs/evidence are preserved. [SHA-256 record](verification/phase047/PRESERVATION.json). The old seed suite rewrites two historical timing reports; the new result is archived separately as [this phase's v1 regression](verification/phase047/V1_SEED_REGRESSION.json). Initial restoration used the pre-test backup. A final rerun after backup cleanup refreshed them again; the existing byte-identical Phase 4.5 JSON archive and unchanged deterministic Markdown emitter recovered both originals, with **both hashes checked against the pre-phase checkpoint before writing**. The [guarded recovery script](verification/phase047/restore-historical-reports.mjs) records this; both historical files match their original SHA-256s.

## Automated and build verification

| Check | Actual result |
| --- | --- |
| Starting baseline | **1,474 tests / 18 files**, 25.81s, exit 0 |
| Final TypeScript | PASS, `tsc --noEmit`, exit 0 |
| Final complete Vitest | **1,574 tests / 21 files**, **25.64s**, exit 0; **100 new cases**, none of the old tests weakened |
| Original generated campaign | **1,000/1,000 deterministic cases generated and verified**; original four profiles/fixtures retained |
| Dense references | Existing pinned complete A/B results and known successes/failures pass; real 44/66/85-path renderer/engine cases included |
| Production build | PASS, exit 0; **29 modules**, Vite **293ms** |
| Final Capacitor sync | PASS, exit 0; rebuild **119ms**, sync **0.101s** |
| Android web copies | **4/4 SHA-256 matches** to final dist |
| Production isolation | No dense recipe, lab label or research-module references in shipping JS |
| Browser consoles | No captured app warnings/errors in final production/lab tabs |
| Native APK | **Not compiled**; expected APK absent |

Final output: HTML **0.67kB** / gzip **0.39kB**; CSS **19.00kB** / gzip **4.56kB** (`index-CJogRmSs.css`); JS **74.06kB** / gzip **25.54kB** (`index-DxlKE-ft.js`). [Raw check logs](verification/phase047/FINAL_TEST_LOG.txt), [typecheck](verification/phase047/TYPECHECK_LOG.txt), [build](verification/phase047/BUILD_LOG.txt), [sync](verification/phase047/ANDROID_SYNC_LOG.txt), [asset hashes](verification/phase047/ANDROID_ASSETS.json).

New tests exercise threshold edges/delayed timers, exactly-one tap/completion/Challenge penalty, pure holds with unchanged stored history, canonical blocker/contact, drag/pinch/capture/blur/hidden/pause/restart/switch/wheel/view/resize cancellation before and during a hold, synthetic-click suppression, keyboard preview/repeat gates, terminal gates, ordered dots behind straight/multi-bend tails, nonselectable fading traces, finite fade/reduced-motion cleanup, stale completion/save/audio invalidation, missing/muted/autoplay audio, context/voice/resource limits and immutable dense geometry at three sizes.

Native prerequisites rechecked: selected Java **1.8.0_51**, unset `JAVA_HOME`/Android SDK variables, default SDK absent, `adb` unavailable. Java 21 and Android SDK remain external blockers. Nothing was downloaded; synchronization is not an APK build.

## Actual visual and gameplay evidence

[Annotated gallery](verification/phase047/gallery.html) contains **eight sampled motion playbacks** assembled from unaltered, native-size browser frames at approximate captured intervals, with explicit review pauses. **507 JPEG captures** were dimension-audited; all size-labelled files match their labels. A desktop capture was relabelled correctly, and two transient-resize frames were recaptured at settled phone size. [Audit](verification/phase047/IMAGE_AUDIT.json), [motion summary](verification/phase047/MOTION_SUMMARY.json), [layout matrix](verification/phase047/BROWSER_LAYOUTS.json).

These are actual sampled frame recordings, **not interpolated footage or a claim of continuous 60fps video**. Available browser tooling exposed screenshots rather than a continuous screen recorder. Raw timestamp bounds and final renderer diagnostics accompany every playback. Early diagnostic records sampled DOM after the image and therefore are not exact per-image timestamps; the final `*-fast.json` files record screenshot-call time bounds explicitly.

Key evidence:

- Same four-bend A arrow 021 at 390×844 / 2.25×: [stationary](verification/phase047/A-390-working-fast-stationary.jpg), [first turn](verification/phase047/A-390-working-fast-04.jpg), [later turns](verification/phase047/A-390-working-fast-06.jpg), [departed trace](verification/phase047/A-390-working-fast-12.jpg), [clean end](verification/phase047/A-390-working-fast-30.jpg), [sampled playback](verification/phase047/A-390-working-fast.webp).
- Read-only pixel probes independently detected **0 → 2 → 6 → 10 → 14 → 15 source dots**, followed by fade to zero, while the visible moving-body bounds advanced through the original turns. The script excludes nearby dark ink/body; JPEG desaturates tiny dots, so probes use brightness at isolated source centers. This complements, rather than replaces, exact geometry tests. [Pixel record](verification/phase047/PIXEL_TRAIL_PROGRESSION.json).
- Genuine blocked hold: A arrow 034 → first blocker 037. [Before](verification/phase047/A-390-blocked-hold-before.jpg), [held ruler/contact](verification/phase047/A-390-blocked-hold-held-06.jpg), [released](verification/phase047/A-390-blocked-hold-released.jpg): **44 paths / three hearts / zero attempts** throughout. Full free-path hold/release also captured at 320/390/landscape working views for A/B.
- Production Level 11 at **320×568, 390×844 and 844×390**: holds on arrow 003 correctly preview blocker 004, then dismiss with **seven paths / three hearts / zero attempts**. [320px held](verification/phase047/production-320-blocked-hold-held-06.jpg), [390px held](verification/phase047/production-390-blocked-hold-held-06.jpg), [landscape](verification/phase047/production-landscape-blocked-hold-held-06.jpg). Subsequent real short blocked tap cost exactly one heart; real safe tap removed one path in reduced motion. [Production record](verification/phase047/PRODUCTION_INTERACTION.json).
- After the final margin/control-pointer correction, reloaded the actual final production bundle and repeated a real hold/release followed by a short blocked tap: **0 attempts / three hearts** through the hold, then **one attempt / two hearts**. Restart cleared the old toast and restored the fresh board. Final lab/full-motion settings and clean consoles were rechecked. [Final-build browser record](verification/phase047/FINAL_BROWSER_RECHECK.json).
- Normal v1 Level 11 three-bend motion at [390px](verification/phase047/v1-390-fast.webp) and [320px](verification/phase047/v1-320-fast.webp); dense 44/66-path working motion/hold at both phone sizes and landscape. Canvas equals viewport, document does not scroll, HUD/view controls remain out of safe play. Controls retain **56×56px** targets; Pause remains at least 48px. The old nearest-contact intention limits on dense overviews remain documented; working zoom is still necessary.
- Real B85 keyboard P/Escape preview then Enter: **85→84**, one attempt, three hearts, muted/uninitialized audio. [Keyboard/mute record](verification/phase047/B85_MUTED_KEYBOARD.json). Real pause during A motion restored **44 paths / zero attempts**, stopped audio and cleared dots; no stale removal afterward. [Cancellation](verification/phase047/INTERRUPTED_BROWSER_MOVE.json).
- Actual **44 legal Challenge exits, zero mistakes, all three hearts**, produced [victory](verification/phase047/A-real-victory.jpg) and [victory sound event](verification/phase047/VICTORY_AUDIO.json). Three actual blocked taps produced [defeat](verification/phase047/A-real-defeat.jpg). Zen retained unlimited retries after a blocked tap. These use real engine input, without fabricated terminal state. Reduced motion was used for the full keyboard solution; normal travel was verified separately.

### Performance and honest limits

Separate departures without per-frame screenshot collection:

| 390×844 case | Configured / measured paint-span ms | Frames / maximum gap | Whole-sample maximum draw CPU |
| --- | ---: | ---: | ---: |
| v1 Level 11, three bends | 476.37 / 483.1 | 30 / 17.1ms | 0.3ms |
| A 44, four bends | 510.48 / 515.0 | 32 / 17.3ms | 0.9ms |
| B 66, left exit | 485.30 / 499.6 | 31 / 17.3ms | 0.5ms |

[Quiet-run raw record](verification/phase047/QUIET_MOTION_RUNS.json). Captured phone/landscape working samples have durations approximately **477–557ms**, with the longest measured final paint span **563ms**. The final A 390 working capture has **25 frames / 67.4ms max gap** under recording; an earlier heavily instrumented A overview run had a **190ms gap / 661ms completion**. Both are retained. Other final sampled captures have approximately **16.9–17.3ms max gaps**. Do not present recording stalls as uniformly smooth 60fps.

One B/320 installed sample reached **26.5ms max draw**, already present before its extraction, during that sample's pan/hold/capture work. Its extraction gap stayed 17.2ms and sampled draw p95 0.5ms. Other recorded maxima, sample scopes and p95 values are in the gallery/raw records. These are desktop CPU Canvas diagnostics with coalesced samples; they exclude compositor, input dispatch, audio thread, thermal behavior and Android hardware. They are not phone benchmarks.

Idle paint count stayed **8→8 over 128,885ms**, with no voices, dots or motion pending. [Idle evidence](verification/phase047/IDLE_CHECK.json). Unit clocks additionally verify no residual RAF/timers after completion/cancel/dispose.

No physical Android touch/pinch, cutout/lifecycle/device frame-rate, audible speaker quality or vibration-strength pass is claimed. The original dense overview targeting/intention limitations and A/B generator feasibility decisions remain unchanged. Full normal production motion on a non-reduced physical device needs owner review. No known failing automated check remains.

## Review / next step

Review the gallery and live lab's real tap/hold/travel/audio feel, then test on a physical phone after the separately managed Java 21/SDK setup. Keep the existing campaign/recipes/saves unchanged. **Stopped after Phase 4.7; no further generation revision, campaign migration or broader Phase 5 work has begun.**
