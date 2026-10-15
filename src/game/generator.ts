import { analyzeDifficulty, countTurns } from './difficulty';
import type { DifficultyAnalysis } from './difficulty';
import { createRng, isSeed } from './rng';
import type { SeededRng } from './rng';
import { buildOccupancy, cellKey, firstBlocker, traceExitLane, validateLevel, vectorFor } from './rules';
import { attemptMove, completeEscape, createGameState } from './state';
import type { ArrowPath, Difficulty, Direction, GridPoint, Level } from './types';

export interface GeneratorOptions {
  readonly difficulty?: Difficulty;
  readonly width?: number;
  readonly height?: number;
  readonly minArrows?: number;
  readonly maxArrows?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly maxBends?: number;
  readonly minDensity?: number;
  readonly maxDensity?: number;
  readonly candidateLevels?: number;
  readonly proposalsPerArrow?: number;
  readonly maxProposals?: number;
}

interface Configuration extends Required<GeneratorOptions> {}

export interface GenerationStats {
  readonly candidateLevels: number;
  readonly proposals: number;
  readonly acceptedInsertions: number;
  readonly rejectedProposals: number;
  readonly invalidGeometry: number;
  readonly rejectedLevels: number;
  readonly targetArrowCount: number;
  readonly placedArrowCount: number;
}

export type GenerationFailure = {
  readonly ok: false;
  readonly reason: 'invalid-seed' | 'invalid-options' | 'budget-exhausted' | 'verification-failed';
  readonly message: string;
  readonly stats: GenerationStats;
};

export type GeneratedLevel = {
  readonly ok: true;
  readonly level: Level;
  readonly witness: readonly string[];
  readonly analysis: DifficultyAnalysis;
  readonly requestedDifficulty: Difficulty;
  readonly matchesRequestedDifficulty: boolean;
  readonly stats: GenerationStats;
};
export type GenerationResult = GeneratedLevel | GenerationFailure;

const profiles = {
  easy: { width: 7, height: 7, minArrows: 6, maxArrows: 8, minDensity: 0.27 },
  medium: { width: 9, height: 9, minArrows: 11, maxArrows: 14, minDensity: 0.36 },
  hard: { width: 11, height: 11, minArrows: 18, maxArrows: 21, minDensity: 0.42 },
  expert: { width: 13, height: 13, minArrows: 24, maxArrows: 27, minDensity: 0.46 },
} as const;
const directions: readonly Direction[] = ['up', 'right', 'down', 'left'];
const targets: Readonly<Record<Difficulty, number>> = { easy: 32, medium: 52, hard: 68, expert: 84 };

function configuration(options: GeneratorOptions): Configuration | string {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return 'Expected an options object.';
  const difficulty = options.difficulty ?? 'medium';
  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard' && difficulty !== 'expert') return 'Unsupported difficulty.';
  const defaults: Configuration = { difficulty, ...profiles[difficulty], minLength: 2, maxLength: 7, maxBends: 3,
    maxDensity: 0.78, candidateLevels: 6, proposalsPerArrow: 64, maxProposals: 12000 };
  for (const key of Object.keys(options)) if (!Object.hasOwn(defaults, key)) return `Unsupported generator option: ${key}.`;
  const config: Configuration = { ...defaults, ...options, difficulty };
  const integer = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if (!integer(config.width, 3, 16) || !integer(config.height, 3, 16)) return 'Generator board dimensions must be integers from 3 to 16.';
  if (!integer(config.minArrows, 2, 64) || !integer(config.maxArrows, config.minArrows, 64)) return 'Arrow count range must be integers from 2 to 64, min <= max.';
  if (!integer(config.minLength, 2, 7) || !integer(config.maxLength, config.minLength, 7)) return 'Path length range must be integers from 2 to 7, min <= max.';
  if (config.maxLength < 3 || Math.max(config.width, config.height) < config.minLength) return 'Standard puzzles need room for both a bent path and a straight path within the length bounds.';
  if (!integer(config.maxBends, 1, 3)) return 'Standard generated puzzles require a bend budget from 1 to 3.';
  if (!Number.isFinite(config.minDensity) || !Number.isFinite(config.maxDensity) || config.minDensity < 0 || config.maxDensity > 0.9 || config.maxDensity <= 0 || config.minDensity > config.maxDensity) return 'Density bounds must satisfy 0 <= min <= max <= 0.9, with max > 0.';
  if (config.minArrows * config.minLength > Math.floor(config.width * config.height * config.maxDensity)) return 'Minimum arrows/path lengths cannot fit inside the maximum density.';
  if (config.maxArrows * config.maxLength < Math.ceil(config.width * config.height * config.minDensity)) return 'Maximum arrows/path lengths cannot reach the minimum density.';
  if (!integer(config.candidateLevels, 1, 16) || !integer(config.proposalsPerArrow, 1, 256) || !integer(config.maxProposals, 1, 50000)) return 'Budgets must be bounded: 1..16 candidate levels, 1..256 proposals per arrow, 1..50000 total proposals.';
  return config;
}

/** Immutable, deterministic, bounded reverse construction. Tier is measured, never
 * copied from the request. A mismatch is explicitly reported on a verified result.
 */
export function generateLevel(seed: number, options: GeneratorOptions = {}): GenerationResult {
  const counters = { candidateLevels: 0, proposals: 0, acceptedInsertions: 0, rejectedProposals: 0,
    invalidGeometry: 0, rejectedLevels: 0, targetArrowCount: 0, placedArrowCount: 0 };
  const failure = (reason: GenerationFailure['reason'], message: string): GenerationFailure => Object.freeze({ ok: false, reason, message, stats: Object.freeze({ ...counters }) });
  if (!isSeed(seed)) return failure('invalid-seed', 'Seed must be an integer from 0 to 4294967295.');
  const config = configuration(options);
  if (typeof config === 'string') return failure('invalid-options', config);
  const rng = createRng(seed);
  const recipe = Object.values(config).join('-');
  const id = `procedural-v1-${seed.toString(16).padStart(8, '0')}-${recipe}`;
  let best: Omit<GeneratedLevel, 'stats'> | undefined;
  let bestDistance = Infinity;
  let bestTarget = 0;
  for (let candidateIndex = 0; candidateIndex < config.candidateLevels && counters.proposals < config.maxProposals; candidateIndex++) {
    counters.candidateLevels++;
    const arrows: ArrowPath[] = [];
    const target = rng.int(config.minArrows, config.maxArrows + 1);
    counters.targetArrowCount = target;
    const draft = (): Level => ({ id, seed, width: config.width, height: config.height, arrows });
    for (let slot = 0; slot < target && counters.proposals < config.maxProposals; slot++) {
      const occupancy = buildOccupancy(draft());
      const oldLanes = arrows.map((arrow) => traceExitLane(arrow, config).map(cellKey));
      const occupiedCells = arrows.reduce((sum, arrow) => sum + arrow.cells.length, 0);
      const available = Math.floor(config.width * config.height * config.maxDensity) - occupiedCells
        - Math.max(0, config.minArrows - slot - 1) * config.minLength;
      let selected: ArrowPath | undefined;
      let selectedScore = -Infinity;
      for (let proposal = 0; proposal < config.proposalsPerArrow && counters.proposals < config.maxProposals; proposal++) {
        counters.proposals++;
        const arrow = proposePath(rng, config, occupancy, available, slot);
        if (!arrow || firstBlocker(arrow, occupancy, config) !== null) {
          counters.rejectedProposals++;
          continue;
        }
        if (!validateLevel({ ...draft(), arrows: [...arrows, arrow] }).valid) {
          counters.rejectedProposals++;
          counters.invalidGeometry++;
          continue;
        }
        const own = new Set(arrow.cells.map(cellKey));
        const blocks = oldLanes.filter((lane) => lane.some((key) => own.has(key))).length;
        // Reward dependencies without consuming the board in a few long paths.
        const score = blocks * 2 + arrow.cells.length * 0.15 - Math.max(0, arrow.cells.length - 4)
          + countTurns(arrow) * 0.3
          + (arrows.some((old) => old.direction === arrow.direction) ? 0 : 0.6);
        if (score > selectedScore) { selected = arrow; selectedScore = score; }
      }
      if (!selected) break;
      arrows.push(selected);
      counters.acceptedInsertions++;
    }
    counters.placedArrowCount = arrows.length;
    if (arrows.length < config.minArrows) { counters.rejectedLevels++; continue; }
    const analysis = analyzeDifficulty(draft());
    if (!analysis.ok || !analysis.solvable || analysis.tier === null) {
      return failure('verification-failed', 'A reverse-constructed candidate failed independent geometry/solver verification.');
    }
    const metrics = analysis.metrics;
    if (metrics.density < config.minDensity || metrics.bentArrowCount < Math.ceil(arrows.length * 0.2)
      || !arrows.some((arrow) => countTurns(arrow) === 0) || metrics.initialSafeFraction > 0.85
      || metrics.blockingRelationships < Math.max(1, Math.floor(arrows.length * 0.5))
      || new Set(arrows.map((arrow) => arrow.direction)).size < 2) {
      counters.rejectedLevels++;
      continue;
    }
    const witness = Object.freeze(arrows.map((arrow) => arrow.id).reverse());
    let state = createGameState(draft(), 'zen');
    for (const arrowId of witness) {
      const attempt = attemptMove(state, arrowId);
      if (attempt.type !== 'exiting') return failure('verification-failed', 'Reverse insertion witness encountered a blocked arrow.');
      state = completeEscape(attempt.state);
    }
    if (state.phase !== 'won') return failure('verification-failed', 'Reverse insertion witness did not finish the board.');
    const level = createGameState({ ...draft(), difficulty: analysis.tier }, 'zen').level;
    const candidate = Object.freeze({ ok: true as const, level, witness, analysis,
      requestedDifficulty: config.difficulty, matchesRequestedDifficulty: analysis.tier === config.difficulty });
    const distance = Math.abs(analysis.score! - targets[config.difficulty]);
    if (candidate.matchesRequestedDifficulty || distance < bestDistance) { best = candidate; bestDistance = distance; bestTarget = target; }
    if (candidate.matchesRequestedDifficulty) break;
  }
  if (!best) return failure('budget-exhausted', 'No board satisfied geometry, count, density, bend/direction variety and dependency quality within the configured proposal budgets.');
  return Object.freeze({ ...best, stats: Object.freeze({ ...counters,
    targetArrowCount: bestTarget,
    placedArrowCount: best.level.arrows.length }) });
}

function proposePath(rng: SeededRng, config: Configuration, occupied: ReadonlyMap<string, string>, available: number, slot: number): ArrowPath | undefined {
  if (available < config.minLength) return undefined;
  const head = { x: rng.int(0, config.width), y: rng.int(0, config.height) };
  if (occupied.has(cellKey(head))) return undefined;
  const direction = directions[rng.int(0, 4)]!;
  const headOnly: ArrowPath = { id: 'candidate', direction, cells: [head] };
  if (firstBlocker(headOnly, occupied, config) !== null) return undefined;
  const forbidden = new Set(traceExitLane(headOnly, config).map(cellKey));
  const cells = [head];
  const used = new Set([cellKey(head)]);
  const desiredLength = Math.min(available, rng.int(config.minLength, config.maxLength + 1));
  const outward = vectorFor(direction);
  let previousStep = { x: -outward.x, y: -outward.y };
  let turns = 0;
  const straight = slot % 4 === 0;
  for (let index = 1; index < desiredLength; index++) {
    const point = cells[cells.length - 1]!;
    const choices = directions.map(vectorFor).filter((step) => {
      const bent = step.x !== previousStep.x || step.y !== previousStep.y;
      if (index === 1 && bent || bent && (straight || turns === config.maxBends)) return false;
      const next = { x: point.x + step.x, y: point.y + step.y };
      const key = cellKey(next);
      return next.x >= 0 && next.x < config.width && next.y >= 0 && next.y < config.height
        && !used.has(key) && !occupied.has(key) && !forbidden.has(key);
    });
    if (!choices.length) break;
    const step = choices[rng.int(0, choices.length)]!;
    if (step.x !== previousStep.x || step.y !== previousStep.y) turns++;
    const next = { x: point.x + step.x, y: point.y + step.y };
    cells.push(next); used.add(cellKey(next)); previousStep = step;
  }
  if (cells.length < config.minLength) return undefined;
  cells.reverse();
  return { id: `arrow-${String(slot + 1).padStart(3, '0')}`, direction, cells: cells as [GridPoint, ...GridPoint[]] };
}
