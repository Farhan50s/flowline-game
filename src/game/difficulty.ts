import { buildOccupancy, cellKey, traceExitLane, validateLevel } from './rules';
import type { ValidationIssue } from './rules';
import { solveLevel } from './solver';
import type { SolveResult } from './solver';
import type { ArrowPath, Difficulty } from './types';

export interface Dependency {
  readonly arrowId: string;
  /** Unique owners along the entire lane, in first-occurrence distance order. */
  readonly blockerIds: readonly string[];
}

export interface DifficultyMetrics {
  readonly arrowCount: number;
  readonly occupiedCells: number;
  readonly density: number;
  readonly bentArrowCount: number;
  readonly bentFraction: number;
  readonly meanTurns: number;
  readonly blockingRelationships: number;
  readonly initialSafeCount: number;
  readonly initialSafeFraction: number;
  /** Edge count, not node count. Null when the dependency graph has a cycle. */
  readonly longestChain: number | null;
  readonly cyclic: boolean;
  readonly safeChoiceCounts: readonly number[];
  readonly forcedChoiceFraction: number;
}

export interface DifficultyAnalysis {
  readonly ok: true;
  readonly solvable: boolean;
  readonly dependencies: readonly Dependency[];
  readonly metrics: DifficultyMetrics;
  readonly score: number | null;
  readonly tier: Difficulty | null;
  readonly components: { readonly visual: number; readonly blocking: number };
  readonly solution: SolveResult;
}

export type AnalysisResult = DifficultyAnalysis | {
  readonly ok: false;
  readonly reason: 'invalid-level';
  readonly issues: readonly ValidationIssue[];
};

export const DIFFICULTY_THRESHOLDS = Object.freeze({ medium: 44, hard: 60, expert: 76 });

export function countTurns(arrow: ArrowPath): number {
  let turns = 0;
  for (let index = 1; index < arrow.cells.length - 1; index++) {
    const before = arrow.cells[index - 1]!;
    const point = arrow.cells[index]!;
    const after = arrow.cells[index + 1]!;
    if (point.x - before.x !== after.x - point.x || point.y - before.y !== after.y - point.y) turns++;
  }
  return turns;
}

/** Measures visual and logical constraints; labels are heuristic, not psychometrics. */
export function analyzeDifficulty(value: unknown): AnalysisResult {
  const validation = validateLevel(value);
  if (!validation.valid) return { ok: false, reason: 'invalid-level', issues: validation.issues };
  const level = validation.level;
  const occupancy = buildOccupancy(level);
  const dependencies = level.arrows.map((arrow): Dependency => {
    const owners = new Set<string>();
    for (const point of traceExitLane(arrow, level)) {
      const owner = occupancy.get(cellKey(point));
      if (owner !== undefined && owner !== arrow.id) owners.add(owner);
    }
    return Object.freeze({ arrowId: arrow.id, blockerIds: Object.freeze([...owners]) });
  });
  // Kahn traversal from dependency-free arrows, with iterative depth propagation.
  const remaining = new Map(dependencies.map((entry) => [entry.arrowId, entry.blockerIds.length]));
  const dependents = new Map<string, string[]>();
  const depths = new Map(level.arrows.map((arrow) => [arrow.id, 0]));
  for (const entry of dependencies) for (const blocker of entry.blockerIds) {
    const list = dependents.get(blocker) ?? [];
    list.push(entry.arrowId);
    dependents.set(blocker, list);
  }
  const queue = dependencies.filter((entry) => !entry.blockerIds.length).map((entry) => entry.arrowId);
  const initialSafeCount = queue.length;
  for (let index = 0; index < queue.length; index++) {
    const freeId = queue[index]!;
    for (const dependent of dependents.get(freeId) ?? []) {
      depths.set(dependent, Math.max(depths.get(dependent)!, depths.get(freeId)! + 1));
      const count = remaining.get(dependent)! - 1;
      remaining.set(dependent, count);
      if (count === 0) queue.push(dependent);
    }
  }
  const arrowCount = level.arrows.length;
  const cyclic = queue.length !== arrowCount;
  const longestChain = cyclic ? null : Math.max(0, ...depths.values());
  const turns = level.arrows.map(countTurns);
  const occupiedCells = level.arrows.reduce((sum, arrow) => sum + arrow.cells.length, 0);
  const bentArrowCount = turns.filter((count) => count > 0).length;
  const solution = solveLevel(level);
  const safeChoiceCounts = solution.trace.map((step) => step.safeArrowIds.length);
  const metrics: DifficultyMetrics = Object.freeze({
    arrowCount, occupiedCells, density: occupiedCells / (level.width * level.height),
    bentArrowCount, bentFraction: arrowCount ? bentArrowCount / arrowCount : 0,
    meanTurns: arrowCount ? turns.reduce((sum, count) => sum + count, 0) / arrowCount : 0,
    blockingRelationships: dependencies.reduce((sum, entry) => sum + entry.blockerIds.length, 0),
    initialSafeCount, initialSafeFraction: arrowCount ? initialSafeCount / arrowCount : 0,
    longestChain, cyclic, safeChoiceCounts: Object.freeze(safeChoiceCounts),
    forcedChoiceFraction: safeChoiceCounts.length ? safeChoiceCounts.filter((count) => count === 1).length / safeChoiceCounts.length : 0,
  });
  const visual = Math.min(25, arrowCount * 0.75) + metrics.density * 15 + Math.min(16, metrics.meanTurns * 8);
  const blocking = Math.min(20, arrowCount ? metrics.blockingRelationships / arrowCount * 8 : 0)
    + Math.min(24, (longestChain ?? 0) * 3)
    + (arrowCount ? (1 - metrics.initialSafeFraction) * 12 : 0) + metrics.forcedChoiceFraction * 5;
  const score = solution.solved ? Math.round(Math.min(100, visual + blocking) * 100) / 100 : null;
  const tier: Difficulty | null = score === null ? null : score < DIFFICULTY_THRESHOLDS.medium ? 'easy'
    : score < DIFFICULTY_THRESHOLDS.hard ? 'medium' : score < DIFFICULTY_THRESHOLDS.expert ? 'hard' : 'expert';
  return Object.freeze({ ok: true, solvable: solution.solved, dependencies: Object.freeze(dependencies),
    metrics, score, tier, components: Object.freeze({ visual, blocking }), solution });
}
