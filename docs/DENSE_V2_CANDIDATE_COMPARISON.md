# FLOWLINE — Dense v2 candidate comparison

15 October 2026. Decision applies to this **feasibility prototype**, not a production campaign release.

| Family | Decision | Measured evidence | Required revision |
| --- | --- | --- | --- |
| **A — 17×29, 40–55 paths** | **REVISE** before shipping | 119/128 default seed cases succeeded (**92.97%**); 119 distinct verified layouts; observed counts 40–55. Desktop generation p95 83.85ms. Strong tall presentation at 390px; 320px needs working zoom. | Reduce the 7.03% generation-failure rate, introduce deliberate length/straight-path/composition variety, validate touch policy on phones and conduct human playtests. Suitable for owner research/playtesting now. |
| **B — 23×37, 60–85 paths** | **REVISE** before expanding | Default pilot 18/24 succeeded (**75%**), with 60–77 paths. Separate explicit 85-path experiment: 9/12 succeeded (**75%**), every success had exactly 85 paths. Desktop p95 153.99ms / 254.75ms respectively. | Resolve packing reliability; improve overview targeting and low-DPI readability. Do not expand into a large B corpus or campaign yet. |
| **C — 27×45 or 32×48, 90–120+** | **NO-GO for implementation now** | Deferred; no implemented recipe, generated corpus, visual test or runtime result. A/B still have unresolved gates. | Obtain approval after A/B revisions, then prove capacity, composition, independent solving, touch fallback and device performance before implementation/release decisions. |

No family is approved to ship. None was integrated into numbered v1 progression or saved progress.

## Geometry and logic are separate measurements

| Actual sample | Grid/capacity | Paths / occupied cells | Occupancy | Mean/max length | Mean/max turns | Edges / max dependency depth | Initial safe | Longest forced-choice stretch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A seed 0 | 17×29 / 493 | 44 / 341 | 69.17% | 7.75 / 9 | 3.25 / 5 | 73 / 8 | 40.91% | 1 |
| B seed 0, automatic count | 23×37 / 851 | 66 / 528 | 62.04% | 8.00 / 10 | 3.09 / 6 | 112 / 9 | 33.33% | 3 |
| B seed 0, explicit 85 | 23×37 / 851 | 85 / 528 | 62.04% | 6.21 / 9 | 2.61 / 5 | 167 / 13 | 36.47% | 4 |

The two B samples have **identical occupied-cell counts with different arrow counts and path distributions**. More heads do not create more occupied cells or prove greater human difficulty. The 85-path sample also has 44 left-facing heads out of 85: direction/head clustering needs better composition control.

All returned successes pass the original validator, independent solver and two clean Challenge replays. Construction has a reverse-removal proof. This guarantees solvability of returned boards, not successful generation of every seed/request within its work budget.

V1 score thresholds are unchanged and are not used as calibrated v2 difficulty labels. Solver traces describe one deterministic greedy order; forced-choice stretches include its final single-arrow step. Human difficulty, fairness and perceived beauty remain unvalidated.

## Actual mobile presentation

[Screenshot gallery](verification/dense-v2-gallery.html). Different puzzles at the same 390×844 dimensions:

| Unchanged v1 Level 81 | A seed 0 | B seed 0 |
| --- | --- | --- |
| ![V1 comparison](verification/dense-v2-v1-level81-comparison-390.jpg) | ![A overview](verification/dense-v2-A-s0-overview-390.jpg) | ![B overview](verification/dense-v2-B-s0-overview-390.jpg) |

| At 390×844 | V1 Level 81 | A seed 0 | B seed 0 | B explicit 85 |
| --- | ---: | ---: | ---: | ---: |
| Actual stroke bounds | 342×344px | 341×594px | 343×557px | 341×558px |
| Ink / safe region | 1.80% | 4.12% | 4.72% | 4.56% |
| Overview cell | 28.17px | 21.13px | 15.36px | 15.36px |

These changes come from real taller geometry, not another UI scaling change. The Phase 4.5 full-screen renderer and safe rectangle are byte-unchanged. All visible strokes belong to playable engine paths. Pixel thresholds/anti-aliasing add a few pixels of measurement tolerance; cell occupancy is distinct from screen ink coverage.

The 320px overview is a map of the composition, not a comfortable default working scale: A has 13.57px cells, B 10.56px. Magnification is essential. Landscape preserves the tall shape, so overview width is narrow; working zoom/pan is needed to read and select paths. No non-uniform stretching was used.

## Contact limits

Exact segment-center contacts and ±6px axis jitter selected **zero wrong arrows** for the representative boards across the measured views. Some jitter contacts correctly produce ambiguity rather than an attempt. At 320px, A had 254 ambiguous contacts out of 1,188 ±6px probes; B had 329/1,848. B landscape had 636/1,848.

The harsher ±22px displacement model produces many potential wrong-intention selections in overview. For example, A 320px had 382 wrong-target results among 1,158 in-safe stress contacts; B had 623/1,794. This model deliberately displaces the intended contact; it is **not a physical-finger error probability**. It exposes the limit of nearest-line intent inference even when algorithmic ambiguity itself never costs a heart.

At centered 4×, no wrong-target stress results occurred in the sampled visible segments, but B still had 14 ambiguous cases at 320px and 16 in landscape. All exact/±6px working probes were unambiguous. This supports testing a deliberate working-view policy, but it does not establish whole-board or physical-device usability.

Before shipping, choose and test one policy: overview taps first magnify without attempting; or preview/select then explicitly confirm extraction. At maximum zoom, offer a deliberate candidate chooser/confirmation instead of repeating an ineffective magnify message or guessing. Keep keyboard selection and no-penalty pinch/pan behavior. These are proposals; the shipping target heuristic was not changed.

## Runtime and failure assessment

Windows desktop, Node v22.22.1, Intel Core i5-6500 @3.20GHz; Vite SSR loader. Timing includes full generation, validation, independent solving, both engine replays, metrics and immutable output. Every case was regenerated and compared for determinism outside the timed call.

| Final sample | Cases / successes | Mean | p50 | p95 | Max |
| --- | --- | ---: | ---: | ---: | ---: |
| A automatic, seeds 0–127 | 128 / 119 | 47.39ms | 44.79ms | 83.85ms | 108.76ms |
| B automatic, seeds 0–23 | 24 / 18 | 97.73ms | 96.21ms | 153.99ms | 250.57ms |
| B explicit 85, seeds 0–11 | 12 / 9 | 117.76ms | 109.78ms | 254.75ms | 254.75ms |

Total: **164 distinct seed/configuration cases, 146 verified distinct layouts, 18 typed budget failures**. Numeric seeds overlap across different families/configurations. This is not a claim of 1,000 dense successes. The original 1,000-seed v1 regression also passed separately.

The lab already performs generation/verification in a disposable Web Worker. That keeps generation out of input handlers and animation frames; worker startup/result-copy overhead is separate from reported generator CPU time. Desktop timings do not validate the future 100–250ms phone budget. Whole-frame timing, thermal effects, cutouts, physical touch and long-session memory behavior still need devices.

## Next approval

Approve a new recipe revision for composition/reliability work and a research touch-policy experiment before any shipping integration. A future Dense campaign needs its own explicitly versioned resolver and progress key, with old v1 data untouched. Phase 5, save migration and campaign integration remain out of scope.

Full implementation, commands, tests, failure seeds, preservation checks and screenshot paths: [DENSE_V2_FEASIBILITY_HANDOFF.md](DENSE_V2_FEASIBILITY_HANDOFF.md).
