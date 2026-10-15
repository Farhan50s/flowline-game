# FLOWLINE — Phase 01 handoff

Date: 14 October 2026 (Asia/Karachi)

## Scope and starting point

The repository initially contained only `README.md`, with a clean `main` branch tracking `origin/main`. `FLOWLINE_ONE_DAY_GAME_BLUEPRINT.md` was absent; the supplied Phase 1 requirements governed implementation. Existing Git history was preserved. Git reported an ownership mismatch, so inspection used a command-scoped `safe.directory` exception; no global Git configuration was changed.

The official `create-vite@9.2.1` vanilla TypeScript template was scaffolded in an isolated temporary folder, inspected, and adapted into the root. Its demo content was excluded and the temporary scaffold was removed. TypeScript 5.9.3 was deliberately selected as a stable compiler compatible with the chosen tooling; strict verification is enabled explicitly.

## Implemented

- Original ivory, ink, and teal home screen with the FLOWLINE title, subtitle, code-drawn canvas artwork, Preview Board, and Settings controls.
- Explicitly non-interactive Board Preview with ten hand-authored straight/bent paths and an artwork-only notice. These compositions are not playable levels.
- Semantic controls, focus indicators, modal dialog with focus restoration and Escape support, canvas descriptions, portrait/landscape layouts, safe-area padding, and accessible button contrast.
- Device-pixel-ratio-aware Canvas 2D rendering, centred grid geometry, ResizeObserver and DPR-change handling. Rendering is event-driven; there is no perpetual animation loop. Event listeners, observers, and pending frames are cleaned up on HMR disposal.
- Sound, haptics, and reduced-motion preferences stored locally in a versioned format. Refresh restores choices; malformed values and unavailable/full storage are handled safely. Sound and haptics are explicitly described as preferences for future gameplay; this phase emits neither audio nor vibration. Reduced motion disables interface transitions and respects the OS preference.
- Browser-independent contracts for GridPoint, Direction, ArrowPath, Level, GameMode, GamePhase, and GameState. Paths are tail-to-head cell sequences with an outward direction.
- Strict TypeScript, Vitest tests for persistence/geometry/artwork validity, npm scripts, lockfile, production web bundling, and Capacitor Android foundation.
- Original native vector launcher/adaptive icons and an ivory splash theme. Native edge-to-edge initialization is enabled. The template INTERNET permission, unused FileProvider, and unused Google Services Gradle wiring were removed; the app declares no permissions.

No rules, collisions, generation, solving, escape animation, hearts, hints, audio synthesis, monetization, accounts, analytics, backend, or network services were implemented. Later-phase files were not created as empty stubs.

## Source structure

```text
flowline-game/
  android/                         Capacitor native Android project
  docs/
    PHASE_01_HANDOFF.md
    verification/
      home-430.jpg                 Production browser screenshot
      board-430.jpg                Production browser screenshot
  public/
    favicon.svg                    Original vector mark
  src/
    game/
      types.ts                     Browser-independent domain contracts
    graphics/
      geometry.ts                  Pure canvas sizing and direction vectors
      preview.ts                   Hand-authored artwork, not puzzle levels
      render.ts                    Passive, responsive Canvas 2D renderer
    storage/
      settings.ts                  Versioned persistence and pure transformations
    ui/
      settings.ts                  Dialog, toggles, persistence feedback
    tests/
      geometry.test.ts
      settings.test.ts
    main.ts                        Screen composition and navigation
    styles.css                     Tokens, layouts, accessibility, safe areas
    vite-env.d.ts
  .gitignore
  capacitor.config.ts
  index.html
  package.json
  package-lock.json
  README.md
  tsconfig.json
  vite.config.ts
```

Generated `dist/`, dependency caches, native build products, synchronized web assets, and machine-specific `android/local.properties` are ignored. Recreate synchronized assets using `npm run android:sync` after cloning.

## Runtime and direct packages

| Component | Version |
| --- | --- |
| Node.js, verified installed | 22.22.1 |
| npm, verified installed | 10.9.4 |
| TypeScript | 5.9.3 |
| Vite | 8.3.4 |
| Vitest | 5.0.4 |
| @capacitor/core | 8.5.3 |
| @capacitor/android | 8.5.3 |
| @capacitor/cli | 8.5.3 |

All direct versions are pinned; `package-lock.json` records transitive dependencies. Vite and Vitest require Node 22.12+ on Node 22; Capacitor 8 requires Node 22+. npm registry engine metadata was checked before installation. No framework or external asset/font dependency is used.

## Commands

```sh
npm ci
npm run dev               # http://127.0.0.1:5173
npm run typecheck
npm run test              # one run, then exits
npm run build             # strict checking followed by Vite output to dist/
npm run preview           # production assets at http://127.0.0.1:4173
npm run android:sync      # builds web assets, then synchronizes Android
npm run android:open      # requires Android Studio
```

Windows debug build, once the native prerequisites are installed:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

## Verification

| Verification | Actual result |
| --- | --- |
| Dependency installation | PASS: 134 packages added; exact direct versions verified using `npm ls --depth=0`. |
| `npm run typecheck` | PASS, exit 0. The final production build also runs strict `tsc --noEmit`. |
| `npm run test` | PASS: 2 files, 15 meaningful tests; exits 0. Final run took 2.09 seconds. |
| `npm run build` | PASS. Final build: 10 modules, 1.03 seconds during `android:sync`. Output: HTML 0.67 kB, CSS 11.01 kB, JS 11.95 kB (gzip: 0.40 / 2.87 / 4.73 kB). |
| Local browser launch | PASS: dev server at `127.0.0.1:5173` and production preview at `127.0.0.1:4173` both launched and were inspected. |
| Browser interaction | PASS: home-to-preview and Back navigation, preview heading focus, Settings dialog, three toggles, saved state restored after refresh, Escape dismissal and focus restoration. |
| Responsive visual inspection | PASS: 320×568, 390×844, 430×932 portrait; 844×390 landscape; 1024×768 wide layout. No horizontal overflow in measured phone layouts. Short screens scroll vertically. The narrow portrait artwork was reduced to keep the primary control visible. |
| Canvas sizing | PASS: resizing produces a centred square canvas; the observed landscape canvas had a 318×318 CSS/backing size at DPR 1. Pure tests cover DPR 3 and fractional DPR 1.25. High-density physical Android display testing remains pending. |
| Browser console | No warnings/errors captured for the inspected tab. |
| Android platform | PASS: `npm exec -- cap add android` generated the platform successfully. |
| Android synchronization | PASS: final `npm run android:sync` rebuilt web assets and completed Capacitor sync successfully. All four production web files were verified byte-identical to their Android copies using SHA-256 hashes. |
| Native source inspection | Native XML parsed successfully. Original vector resources and safe-area configuration were reviewed; this is source inspection, not native compilation. |
| Debug APK | BLOCKED by the native environment described below. Gradle compilation was not attempted because no SDK/compatible JDK is available. No APK exists at `android/app/build/outputs/apk/debug/app-debug.apk`; there is no actual APK output path to report. |

The sandbox initially enforced offline npm access, then rejected registry connections. Approved network access allowed installation; the first install hit a registry idle timeout, and the retry using cached downloads succeeded. npm emitted a transitive `uuid@7.0.3` deprecation warning from Capacitor CLI tooling. This is not an application runtime dependency added by Flowline.

Initial sandboxed Vite/Vitest runs failed with `spawn EPERM` when Vite attempted a required Windows subprocess. Approved runs completed successfully without changing application behavior. No checks were replaced with placeholder passes.

Production screenshots are saved in `docs/verification/`. Native vector/splash appearance, permissions after manifest merging, actual offline APK operation, and cutout/system-bar behavior remain to be verified on a device once native building is possible.

## Android prerequisites and limitations

App name: `Flowline`. Temporary app ID: `com.example.flowline`. Web asset directory: `dist`. Review/change the application ID before distribution. Capacitor SystemBars uses native inset handling, a light background style, and a `cover` viewport hint; CSS uses safe-area environment values. Capacitor's built-in handling pads older WebViews where safe-area environment values are unreliable. [SystemBars documentation](https://capacitorjs.com/docs/apis/system-bars).

The installed Java executable reports Oracle **1.8.0_51**, and the only JRE found in the standard Java installation directory is Java 8. `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` are unset, and `adb` is unavailable on PATH. Android Studio and SDK were not found in the standard Program Files, current-user LocalAppData, supplied user LocalAppData, or D:\Android locations checked. The Capacitor Android dependency declares Java 21 source/target compatibility. This is an insufficient native build environment.

To build an APK, install/configure Android Studio Otter 2025.2.1 or newer, a JDK 21 compatible with the generated Gradle project (the Studio bundled runtime is suitable when compatible), and Android SDK Platform 36 plus the required build/platform tools. Set the Gradle JDK/`JAVA_HOME`, and point to the SDK using Studio-generated `android/local.properties` or `ANDROID_HOME`. These components were not downloaded during this phase. [Capacitor 8 requirements](https://capacitorjs.com/docs/updating/8-0).

Physical-device/emulator verification remains pending until those prerequisites are available. Browser viewport tests cannot prove native cutout, navigation-bar, lifecycle, or hardware Back behavior.

Settings currently use localStorage in the application WebView. They persist across normal refresh/restarts, but uninstalling or clearing application data removes them. Native preferences and Android hardware Back integration may be considered when gameplay is introduced.

## Phase 2 readiness

The browser shell, visual tokens, renderer, saved preferences, domain contracts, and test runner are ready for Phase 2 implementation after approval. Pure rules and state modules can be added under `src/game/` without importing the DOM renderer. Preview artwork must remain distinct from real levels. Android packaging is configured, while native compilation/device testing depends on the environment setup above. The absent blueprint should be supplied/reviewed before making product decisions beyond Phase 1.

Phase 2 has not begun.
