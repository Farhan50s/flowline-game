import { getSafeArrowIds, validateLevel } from './rules';
import type { ValidationIssue } from './rules';
import { attemptMove, completeEscape, createGameState } from './state';

export interface SolveStep {
  readonly arrowId: string;
  readonly safeArrowIds: readonly string[];
  readonly activeCount: number;
}

interface SolveTrace {
  readonly order: readonly string[];
  readonly trace: readonly SolveStep[];
}

export type SolveResult =
  | (SolveTrace & { readonly solved: true })
  | (SolveTrace & {
    readonly solved: false;
    readonly reason: 'invalid-level' | 'deadlock' | 'engine-invariant';
    readonly remainingArrowIds: readonly string[];
    readonly issues: readonly ValidationIssue[];
    readonly message: string;
  });

/** Complete greedy solver: removing a safe arrow cannot create new blockers.
 * Uses ONLY the level and Phase 2 rules/state, never generator witness metadata.
 * Successful removals are bounded by the initial arrow count.
 */
export function solveLevel(value: unknown): SolveResult {
  const validation = validateLevel(value);
  if (!validation.valid) return Object.freeze({
    solved: false, reason: 'invalid-level', remainingArrowIds: Object.freeze([]),
    order: Object.freeze([]), trace: Object.freeze([]),
    issues: Object.freeze(validation.issues.map((issue) => Object.freeze({ ...issue }))),
    message: 'Level geometry failed validation.',
  });
  let state = createGameState(validation.level, 'zen');
  const order: string[] = [];
  const trace: SolveStep[] = [];
  const failure = (reason: 'deadlock' | 'engine-invariant', message: string): SolveResult => Object.freeze({
    solved: false, reason, message,
    remainingArrowIds: Object.freeze(state.level.arrows.filter((arrow) => state.activeArrowIds.has(arrow.id)).map((arrow) => arrow.id)),
    order: Object.freeze(order), trace: Object.freeze(trace), issues: Object.freeze([]),
  });
  for (let step = 0; step < validation.level.arrows.length; step++) {
    const safe = getSafeArrowIds(state);
    const arrowId = safe[0];
    if (arrowId === undefined) return failure('deadlock', 'No active arrow has a clear head exit lane.');
    const activeCount = state.activeArrowIds.size;
    const attempt = attemptMove(state, arrowId);
    if (attempt.type !== 'exiting' || attempt.state.activeArrowIds.size !== activeCount) {
      return failure('engine-invariant', 'A selected safe arrow did not enter deferred extraction.');
    }
    const completed = completeEscape(attempt.state);
    if (completed.activeArrowIds.size !== activeCount - 1 || completed.activeArrowIds.has(arrowId)) {
      return failure('engine-invariant', 'Escape completion did not remove exactly the selected arrow.');
    }
    order.push(arrowId);
    trace.push(Object.freeze({ arrowId, safeArrowIds: Object.freeze([...safe]), activeCount }));
    state = completed;
  }
  if (state.activeArrowIds.size || state.phase !== 'won') return failure('engine-invariant', 'Solver did not reach an empty won board.');
  return Object.freeze({ solved: true, order: Object.freeze(order), trace: Object.freeze(trace) });
}
