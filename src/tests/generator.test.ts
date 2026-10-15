import { describe, expect, it, vi } from 'vitest';
import { generateLevel } from '../game/generator';
import type { GeneratorOptions } from '../game/generator';
import { analyzeDifficulty, countTurns } from '../game/difficulty';
import { validateLevel } from '../game/rules';
import { ONBOARDING_LEVELS } from '../game/levels';
import { createGameState, restartLevel } from '../game/state';
import golden from './fixtures/generated-v1-seed0-easy.json';

describe('initial generation verification', () => {
  it.each(['easy', 'medium', 'hard', 'expert'] as const)('%s produces verified boards for boundary and representative seeds', (difficulty) => {
    for (const seed of [0, 1, 2, 42, 0xFFFF_FFFF]) {
      const result = generateLevel(seed, { difficulty });
      expect(result.ok, `${difficulty}:${seed} ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(validateLevel(result.level).valid).toBe(true);
      expect(result.analysis.solution.solved).toBe(true);
      expect(result.level.difficulty).toBe(result.analysis.tier);
      expect(result.level.arrows.every((arrow) => arrow.cells.length >= 2 && arrow.cells.length <= 7 && countTurns(arrow) <= 3)).toBe(true);
      expect(restartLevel(createGameState(result.level, 'zen')).level).toEqual(result.level);
    }
  });

  it('has exactly ten validated original onboarding boards', () => {
    expect(ONBOARDING_LEVELS).toHaveLength(10);
    expect(ONBOARDING_LEVELS.every((level) => validateLevel(level).valid)).toBe(true);
  });
});

describe('deterministic generation and bounded input contracts', () => {
  it('preserves the version 1 serialized reference geometry and reverse witness', () => {
    const result = generateLevel(0, { difficulty: 'easy' });
    if (!result.ok) throw new Error(result.message);
    expect({ level: result.level, witness: result.witness }).toEqual(golden);
  });
  it('returns byte-identical geometry, IDs, witness, measured metadata and stats with identical options', () => {
    const options = Object.freeze({ difficulty: 'hard' as const, proposalsPerArrow: 64 });
    const first = generateLevel(37, options);
    expect(first.ok).toBe(true);
    const serialized = JSON.stringify(first);
    generateLevel(900, { difficulty: 'easy' });
    generateLevel(10, { difficulty: 'expert' });
    expect(JSON.stringify(generateLevel(37, options))).toBe(serialized);
    expect(JSON.stringify(first)).toBe(serialized);
    expect(options).toEqual({ difficulty: 'hard', proposalsPerArrow: 64 });
  });
  it('does not call ambient randomness and returns frozen geometry/witness snapshots', () => {
    const forbidden = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Ambient randomness'); });
    try {
      const result = generateLevel(0, { difficulty: 'easy' });
      if (!result.ok) throw new Error(result.message);
      expect(Object.isFrozen(result.level)).toBe(true);
      expect(Object.isFrozen(result.level.arrows[0]!.cells[0])).toBe(true);
      expect(Object.isFrozen(result.witness)).toBe(true);
      expect(result.level.difficulty).toBe(analyzeDifficulty(result.level).ok ? result.analysis.tier : 'invalid');
    } finally { forbidden.mockRestore(); }
  });
  it('honestly reports requested/measured mismatches instead of manufacturing the requested label', () => {
    const result = generateLevel(2, { difficulty: 'easy' });
    if (!result.ok) throw new Error(result.message);
    expect(result.requestedDifficulty).toBe('easy');
    expect(result.matchesRequestedDifficulty).toBe(false);
    expect(result.level.difficulty).toBe('medium');
    expect(result.analysis.tier).toBe('medium');
  });
  it.each([-1, 0.2, NaN, Infinity, 4294967296, '1'])('returns a typed invalid-seed failure for %s', (seed) => {
    expect(generateLevel(seed as number)).toMatchObject({ ok: false, reason: 'invalid-seed', stats: { proposals: 0 } });
  });
  it.each([
    { difficulty: 'other' }, { width: 2 }, { height: 17 }, { minArrows: 0 }, { minArrows: 12, maxArrows: 11 },
    { minLength: 1 }, { maxLength: 8 }, { maxLength: 2 }, { maxBends: 0 }, { minDensity: NaN }, { maxDensity: 1 },
    { candidateLevels: 0 }, { proposalsPerArrow: 257 }, { maxProposals: 50001 }, { surprise: true },
    { width: 3, height: 3, minArrows: 10, maxArrows: 10 },
    { width: 16, height: 16, minArrows: 2, maxArrows: 2, maxLength: 2, minDensity: 0.8, maxDensity: 0.9 },
  ])('rejects inconsistent/unsupported options clearly: %j', (options) => {
    const result = generateLevel(1, options as GeneratorOptions);
    expect(result).toMatchObject({ ok: false, reason: 'invalid-options', stats: { proposals: 0 } });
    if (result.ok) throw new Error('Expected options failure');
    expect(result.message.length).toBeGreaterThan(0);
  });
  it('terminates precisely at an intentionally insufficient overall proposal budget', () => {
    const result = generateLevel(0, { difficulty: 'easy', maxProposals: 1 });
    expect(result).toMatchObject({ ok: false, reason: 'budget-exhausted', stats: { proposals: 1, candidateLevels: 1 } });
  });
  it('respects custom board/path/count bounds without mutating the configuration', () => {
    const options = Object.freeze({ difficulty: 'medium' as const, width: 8, height: 8,
      minArrows: 8, maxArrows: 10, minLength: 2, maxLength: 5, maxBends: 2, minDensity: 0.3 });
    const result = generateLevel(42, options);
    if (!result.ok) throw new Error(result.message);
    expect(result.level).toMatchObject({ width: 8, height: 8 });
    expect(result.level.arrows.length >= 8 && result.level.arrows.length <= 10).toBe(true);
    expect(result.level.arrows.every((arrow) => arrow.cells.length <= 5 && countTurns(arrow) <= 2)).toBe(true);
    expect(result.stats.proposals).toBeLessThanOrEqual(12000);
    expect(result.stats.placedArrowCount).toBe(result.level.arrows.length);
  });
  it.each([760, 797, 855, 889, 951])('expert seed %s has enough space to meet its count/quality constraints', (seed) => {
    const result = generateLevel(seed, { difficulty: 'expert' });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.level).toMatchObject({ width: 13, height: 13 });
    expect(result.level.arrows.length).toBeGreaterThanOrEqual(24);
    expect(result.analysis.solution.solved).toBe(true);
  });
});
