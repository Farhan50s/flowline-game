import { describe, expect, it } from 'vitest';
import { getLevel, ONBOARDING_CONCEPTS, ONBOARDING_LEVELS, seedForLevelNumber } from '../game/levels';
import { buildOccupancy, firstBlocker, traceExitLane, validateLevel } from '../game/rules';
import { solveLevel } from '../game/solver';
import { createGameState, restartLevel } from '../game/state';
import type { Difficulty } from '../game/types';

describe('ten curated puzzles and stable progression', () => {
  it.each(Array.from({ length: 10 }, (_, index) => index + 1))('onboarding %s is unique, valid, solved and retrieved without procedural generation', (number) => {
    const result = getLevel(number);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.source).toBe('onboarding');
    expect(result.level).toBe(ONBOARDING_LEVELS[number - 1]);
    expect(result.level.seed).toBe(seedForLevelNumber(number));
    expect(validateLevel(result.level).valid).toBe(true);
    expect(solveLevel(result.level).solved).toBe(true);
    expect(result.witness).toHaveLength(result.level.arrows.length);
    expect(result.generation).toBeUndefined();
    expect(Object.isFrozen(result.level.arrows)).toBe(true);
  });
  it('has ten distinct layouts independently of IDs or seed metadata and introduces the promised concepts', () => {
    expect(new Set(ONBOARDING_LEVELS.map((level) => JSON.stringify({ width: level.width, height: level.height,
      paths: level.arrows.map(({ cells, direction }) => ({ cells, direction })) }))).size).toBe(10);
    expect(ONBOARDING_CONCEPTS).toHaveLength(10);
    const first = ONBOARDING_LEVELS[0]!;
    expect(first.arrows).toHaveLength(1);
    expect(traceExitLane(first.arrows[0]!, first)).toEqual([]);
    const second = ONBOARDING_LEVELS[1]!;
    expect(firstBlocker(second.arrows[0]!, buildOccupancy(second), second)).toBe(second.arrows[1]!.id);
    const bodyLesson = ONBOARDING_LEVELS[4]!;
    expect(firstBlocker(bodyLesson.arrows[0]!, buildOccupancy(bodyLesson), bodyLesson)).toBe(bodyLesson.arrows[1]!.id);
    const nearest = ONBOARDING_LEVELS[5]!;
    expect(firstBlocker(nearest.arrows[0]!, buildOccupancy(nearest), nearest)).toBe(nearest.arrows[1]!.id);
    expect(ONBOARDING_LEVELS[9]!.arrows).toHaveLength(10);
  });
  it.each([11, 21, 41, 81, 999, 0xFFFF_FFFF])('procedural level %s maps repeatably to its seed and measured tier', (number) => {
    const first = getLevel(number);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) throw new Error(first.message);
    expect(first.source).toBe('procedural');
    expect(first.level.seed).toBe(seedForLevelNumber(number));
    expect(first.level.difficulty).toBe(first.analysis.tier);
    expect(first).toEqual(getLevel(number));
    const state = createGameState(first.level, 'challenge');
    expect(restartLevel(state).level).toEqual(state.level);
  });
  it('keeps overrides deterministic and does not alter fixed onboarding boards', () => {
    expect(getLevel(2, 'expert')).toEqual(getLevel(2));
    const result = getLevel(41, 'easy');
    if (!result.ok) throw new Error(result.message);
    expect(result.generation!.requestedDifficulty).toBe('easy');
    expect(result).toEqual(getLevel(41, 'easy'));
  });
  it.each([0, -1, 1.5, NaN, Infinity, 4294967296])('rejects invalid level number %s', (number) => {
    expect(getLevel(number)).toMatchObject({ ok: false, reason: 'invalid-level-number' });
    expect(() => seedForLevelNumber(number)).toThrow(RangeError);
  });
  it('rejects unsupported difficulty rather than silently defaulting', () => {
    expect(getLevel(11, 'nightmare' as Difficulty)).toMatchObject({ ok: false, reason: 'unsupported-difficulty' });
  });
  it('maps a representative sequence to distinct uint32 seeds without consuming any stream', () => {
    const first = Array.from({ length: 1000 }, (_, index) => seedForLevelNumber(index + 11));
    expect(new Set(first).size).toBe(1000);
    getLevel(13);
    expect(first).toEqual(Array.from({ length: 1000 }, (_, index) => seedForLevelNumber(index + 11)));
  });
  it('preserves the version 1 seed mapping reference vectors', () => {
    expect([11, 21, 41, 81, 4294967295].map(seedForLevelNumber)).toEqual([
      4148434293, 3620673069, 2076464231, 3620280206, 3168319277,
    ]);
  });
});
