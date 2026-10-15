# FLOWLINE — Dense level v2 proposal

Status: **design only; requires approval after Phase 4.5 visual review.** No v2 generator, recipe, save migration or progression change is implemented.

## What Phase 4.5 resolves, and what it cannot resolve

Gameplay now has a full-viewport Canvas, an inset-aware play rectangle, slender paths, precise targeting and accessible zoom. A square grid remains square. Enlarging it cannot create a tall, intricate composition or longer nested paths.

Actual unchanged procedural-v1 samples:

| Level | Grid | Arrows | Occupied cells | Grid occupancy | Mean turns/path | Blocking edges | Longest dependency chain |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 11 | 7×7 | 7 | 28 | 57.14% | 1.0 | 6 | 2 |
| 41 | 11×11 | 20 | 82 | 67.77% | 1.2 | 31 | 6 |
| 81 | 13×13 | 25 | 105 | 62.13% | 1.2 | 38 | 8 |

These are interactive, independently verified puzzles, not decorative artwork. V1's 2–7-cell paths and maximum three turns do not produce the long, nested style visible in the supplied video. The 11.88-second clip shows a tutorial labelled Level 4; it is evidence for composition and motion, not enough evidence to infer late-game difficulty, generator rules or arrow-count distributions. Create original compositions and motion; do not import another game's paths, art, branding or sound.

## Exploration targets, not proven output

Explore roughly **40–120+ arrows**, taller grids, longer paths, varied bend counts, nested lanes and deliberate negative space. Arrow count alone is not difficulty. All ranges below need generation, independent validation and device usability measurements before adoption.

| Candidate family | Illustrative grid | Count exploration | Composition question |
| --- | --- | --- | --- |
| Introduction to dense play | 17×29 | 40–60 | Can players read winding paths and discover zoom without frustration? |
| Dense challenge | 23×37 | 60–90 | Can dependencies increase while maintaining distinct, selectable lanes? |
| Dense expert | 27×45 or 32×48 | 90–120+ | Can long nested paths remain readable and performant at overview scale? |

Capacity must constrain the recipe. For example, 120 paths averaging eight occupied cells need at least 960 distinct cells: 79.0% of a 27×45 grid, or 62.5% of 32×48, before any extra spacing constraints. A 17×29 grid cannot support that combination. Prototype length distributions (including a restrained long-path tail), 2–6 turns and multiple composition families; reject combinations whose geometry or interaction is poor. Stay within the existing validated domain limits unless a separately tested change is approved.

## Construction and independent verification

1. Define an explicit `procedural-v2` recipe with all dimensions, counts, length/turn distributions, construction budgets, quality gates and recipe version included in identity. Use deterministic integer-seeded RNG with documented draw order.
2. Extend reverse construction with original tall composition templates: corridors, interlocking nested groups and openings. Reject shared cells, non-cardinal adjacency, self-intersection, invalid final head direction and head rays that meet the arrow's own trailing body under the existing game rules.
3. For each reverse insertion, prove its removal route against the already constructed geometry. Record a complete witness. Use bounded retries and a typed failure when the requested quality is unattainable; never silently label a sparse fallback as dense expert.
4. Independently validate the completed geometry and solve with the existing rule engine/solver rather than trusting the construction witness. Replay both the independent solution and witness through immutable states to genuine victory. Every drawn path must correspond to exactly one legal, interactive arrow.
5. Measure quality after solving. Retain rejected candidates' reasons and timing distributions so quality gates are reviewable.

## Difficulty and composition measurements

Keep count, grid occupancy and screen ink coverage separate. Log length/turn distributions, directional balance, head distribution, connected visual groups, empty bands, blocking graph edges/chain depth, initially removable fraction and the safe-choice trace during independent solving. Investigate dependency branching and forced-choice runs as distinct measures: a board with one obvious safe move can be easy despite a long chain.

Use a held-out deterministic corpus, compare requested versus measured difficulty, and calibrate against human play sessions: completion time, mistakes, restarts, zoom frequency, ambiguous taps and perceived fairness. Do not equate a denser drawing with harder reasoning or assign final tier cutoffs from aesthetic preference. Keep cosmetic composition gates out of collision rules.

## Human-playable view and touch policy

- Use the existing safe rectangle and exact world/CSS inverse. Tall geometry should fill more portrait height while preserving equal horizontal/vertical cell scale.
- Prototype overview cells around 12–18 CSS px with bounded approximately 1.3–2px strokes and distinct directional heads; these are targets requiring low-DPI/outdoor inspection. A 32-column grid is only about 11px/cell at 390px and will require zoom. Do not solve this with illegibly thin strokes.
- Provide a reliable 24–32+px/cell working view, pinch/pan, accessible magnify and reset. Retain positional context and keep controls clear of the puzzle. Evaluate whether the existing 4× zoom cap remains sufficient before changing it.
- Preserve the 44px finger-range ambiguity check. Close paths must trigger a no-penalty magnify/explicit-retap flow. At maximum zoom, repeated ambiguity should offer explicit selection confirmation rather than silently choosing a neighboring path.
- Test dense bends, adjacent parallel segments, intersections of hit ranges, offscreen segments, large text, screen readers, keyboard selection and two-finger release. No mistake for pan, pinch, controls or misses.

## Proposed performance budgets

These are **future acceptance targets, not Phase 4.5 measured device results**:

| Work | Initial target on an agreed midrange Android device |
| --- | --- |
| Canvas draw at dense working view | Mean <6ms, p95 <8ms in a 60Hz frame budget |
| Pointer hit/disambiguation | p95 <4ms, no generation in input/RAF |
| Level preparation | Target 100–250ms p95; show real loading; budget retries and report failures |
| Idle | No continuous RAF; finite effects; no growth in listeners, pointer maps or cached levels after 100 loads |

Measure actual whole-frame timing, input latency, allocations and foreground/background behavior. The Phase 4.5 desktop paint counters exclude compositing and are not proof of these budgets. If larger recipes block the main thread, move generation/verification into a cancellable worker with structured immutable data; keep geometry and solver results deterministic across worker/main-thread execution. Optimize hit testing with a versioned spatial index only if profiling justifies it. Avoid new dependencies without need.

## Save and progression policy

**Existing numbered levels and saves must stay stable.** Preserve `getLevel(n)`'s procedural-v1 mapping for current campaigns, including Levels 11, 41 and 81 and all previously saved seeds/geometry fingerprints. Never point a v1 identity at new geometry.

Prefer a separately named Dense campaign with an explicit recipe selector and independent progression namespace. If a unified campaign is later required, design a reviewed versioned save envelope carrying campaign/recipe identity, retain a v1 decoder and resolver, and prove round-trip restoration with old snapshots before shipping. Unlock rules must explicitly define cross-campaign behavior. Preserve original settings, achievements/unlocks and the player's active v1 run. No migration should occur on mere app launch or because a generation algorithm changed.

## Approval and release gates

1. Approve visual composition prototypes and the identity/progression contract before implementation.
2. Generate and independently solve thousands of fixed seeds across each candidate recipe; include determinism, malformed geometry, budget exhaustion and replay tests. Archive counts, rejection reasons, unique layouts, distributions and runtime percentiles.
3. Demonstrate tall, dense real levels at 320×568, 390×844 and landscape; every visible path must be selectable and removable. Compare overview/working views using actual screenshots and touch recordings.
4. Test on physical low/midrange Android devices with cutouts/system bars, 60Hz/120Hz, low DPI, offline reloads and background interruptions. Run human fairness/readability sessions before claiming quality parity.
5. Preserve all v1 fixture hashes, IDs, seed regressions and saved-run replay tests. Finish standard TypeScript/tests/build/synchronization and native builds when prerequisites exist.

Phase 4.5 stops before these gates. It is ready for visual review, not a claim that dense-v2 levels already exist.
