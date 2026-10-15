import { describe, expect, it } from 'vitest';
import { solveLevel } from '../game/solver';
import { getSafeArrowIds } from '../game/rules';
import { attemptMove, completeEscape, createGameState } from '../game/state';
import { bentBlockedLevel, bentOpenLevel, chainLevel, fixtureArrow, fixtureLevel, selfRayLevel, singleArrowLevel } from './fixtures/puzzles';

describe('independent greedy solver', () => {
  it.each([chainLevel, bentOpenLevel, bentBlockedLevel, singleArrowLevel])('solves original valid fixtures using deferred state transitions', (level) => {
    const before = structuredClone(level);
    const solved = solveLevel(level);
    expect(solved.solved).toBe(true);
    expect(solved.order).toHaveLength(level.arrows.length);
    expect(new Set(solved.order).size).toBe(level.arrows.length);
    let state = createGameState(level, 'challenge');
    for (const [index, id] of solved.order.entries()) {
      expect(solved.trace[index]!.safeArrowIds).toEqual(getSafeArrowIds(state));
      const attempt = attemptMove(state, id);
      expect(attempt.type).toBe('exiting');
      expect(attempt.state.activeArrowIds.size).toBe(state.activeArrowIds.size);
      expect(attempt.state.pendingArrowId).toBe(id);
      state = completeEscape(attempt.state);
    }
    expect(state).toMatchObject({ phase: 'won', hearts: 3, mistakes: 0, moves: level.arrows.length });
    expect(level).toEqual(before);
  });
  it('has a fixed stable order and safe-choice trace on the nearest/farther blocker fixture', () => {
    const solution = solveLevel(chainLevel);
    expect(solution.order).toEqual(['far', 'near', 'lead', 'unrelated']);
    expect(solution.trace.map((step) => step.safeArrowIds.length)).toEqual([3, 2, 2, 1]);
    expect(solution.trace.map((step) => step.activeCount)).toEqual([4, 3, 2, 1]);
  });
  it('reports all unresolved arrows after removing an independent arrow from a deadlocked board', () => {
    const level = fixtureLevel([
      fixtureArrow('east', 'right', [0, 2], [1, 2]),
      fixtureArrow('west', 'left', [4, 2], [3, 2]),
      fixtureArrow('free', 'up', [6, 1], [6, 0]),
    ]);
    const result = solveLevel(level);
    expect(result).toMatchObject({ solved: false, reason: 'deadlock', order: ['free'], remainingArrowIds: ['east', 'west'] });
    expect(result.trace).toHaveLength(1);
  });
  it('returns an empty solution for an empty validated board', () => {
    expect(solveLevel(fixtureLevel([], 1, 1))).toEqual({ solved: true, order: [], trace: [] });
  });
  it.each([null, selfRayLevel, { ...chainLevel, width: 0 }])('reports invalid data without attempting moves', (level) => {
    const result = solveLevel(level);
    expect(result.solved).toBe(false);
    if (result.solved) throw new Error('Expected validation failure');
    expect(result.reason).toBe('invalid-level');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.order).toEqual([]);
  });
  it('does not depend on seed, labels or generator witness fields, and accepts frozen inputs', () => {
    const level = createGameState(chainLevel, 'zen').level;
    expect(solveLevel({ ...level, seed: 999, difficulty: 'expert', witness: ['not-real'] })).toEqual(solveLevel(level));
    const result = solveLevel(level);
    expect(Object.isFrozen(result.order)).toBe(true);
    expect(Object.isFrozen(result.trace)).toBe(true);
  });
});
