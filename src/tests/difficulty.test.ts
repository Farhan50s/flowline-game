import { describe, expect, it } from 'vitest';
import { analyzeDifficulty, countTurns, DIFFICULTY_THRESHOLDS } from '../game/difficulty';
import { bentArrow, chainLevel, fixtureArrow, fixtureLevel } from './fixtures/puzzles';

describe('auditable difficulty and dependency graph', () => {
  it('counts all blockers beyond the nearest and provides explicit hand-checked metrics', () => {
    const result = analyzeDifficulty(chainLevel);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected valid analysis');
    expect(result.dependencies[0]).toEqual({ arrowId: 'lead', blockerIds: ['near', 'far'] });
    expect(result.metrics).toEqual({
      arrowCount: 4, occupiedCells: 8, density: 8 / 63, bentArrowCount: 0, bentFraction: 0,
      meanTurns: 0, blockingRelationships: 2, initialSafeCount: 3, initialSafeFraction: 0.75,
      longestChain: 1, cyclic: false, safeChoiceCounts: [3, 2, 2, 1], forcedChoiceFraction: 0.25,
    });
    expect(result.score).toBe(16.15);
    expect(result.tier).toBe('easy');
  });
  it('deduplicates multiple cells of one blocker while retaining every distinct blocker', () => {
    const result = analyzeDifficulty(fixtureLevel([
      fixtureArrow('a', 'right', [0, 2], [1, 2]),
      fixtureArrow('b', 'right', [3, 2], [4, 2]),
      fixtureArrow('c', 'up', [6, 3], [6, 2]),
    ]));
    if (!result.ok) throw new Error('Expected valid analysis');
    expect(result.dependencies[0]!.blockerIds).toEqual(['b', 'c']);
    expect(result.metrics.blockingRelationships).toBe(3);
    expect(result.metrics.longestChain).toBe(2);
  });
  it('counts real turns rather than labeling all long paths as bent', () => {
    expect(countTurns(bentArrow)).toBe(1);
    expect(countTurns(fixtureArrow('straight', 'right', [1, 1], [2, 1], [3, 1], [4, 1]))).toBe(0);
    const result = analyzeDifficulty(fixtureLevel([bentArrow]));
    if (!result.ok) throw new Error('Expected valid analysis');
    expect(result.metrics).toMatchObject({ bentArrowCount: 1, bentFraction: 1, meanTurns: 1 });
  });
  it('detects cycles without recursive traversal or labeling an impossible board expert', () => {
    const result = analyzeDifficulty(fixtureLevel([
      fixtureArrow('east', 'right', [0, 2], [1, 2]),
      fixtureArrow('west', 'left', [4, 2], [3, 2]),
    ]));
    if (!result.ok) throw new Error('Expected valid geometry');
    expect(result.solvable).toBe(false);
    expect(result.metrics).toMatchObject({ cyclic: true, longestChain: null, initialSafeCount: 0 });
    expect(result.score).toBeNull();
    expect(result.tier).toBeNull();
  });
  it('has finite zero metrics on an empty board, and rejects invalid geometry', () => {
    const result = analyzeDifficulty(fixtureLevel([], 1, 1));
    if (!result.ok) throw new Error('Expected valid geometry');
    expect(result.score).toBe(0);
    expect(result.metrics).toMatchObject({ meanTurns: 0, longestChain: 0, density: 0, forcedChoiceFraction: 0 });
    expect(analyzeDifficulty(null)).toMatchObject({ ok: false, reason: 'invalid-level' });
  });
  it('is deterministic, independent of supplied difficulty labels, and does not mutate data', () => {
    const before = structuredClone(chainLevel);
    expect(analyzeDifficulty(chainLevel)).toEqual(analyzeDifficulty({ ...chainLevel, difficulty: 'expert' }));
    expect(chainLevel).toEqual(before);
    expect(DIFFICULTY_THRESHOLDS).toEqual({ medium: 44, hard: 60, expert: 76 });
  });
});
