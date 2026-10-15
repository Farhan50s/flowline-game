import { analyzeDifficulty } from './difficulty';
import type { DifficultyAnalysis } from './difficulty';
import { generateLevel } from './generator';
import type { GeneratedLevel, GenerationFailure } from './generator';
import { createGameState } from './state';
import type { ArrowPath, Difficulty, Direction, GridPoint, Level } from './types';

function path(direction: Direction, ...coordinates: [number, number][]): Omit<ArrowPath, 'id'> {
  return { direction, cells: coordinates.map(([x, y]) => ({ x, y })) as [GridPoint, ...GridPoint[]] };
}

function onboarding(number: number, width: number, height: number, concept: string, paths: readonly Omit<ArrowPath, 'id'>[]) {
  const id = `onboarding-${String(number).padStart(2, '0')}`;
  const draft: Level = { id, seed: seedForLevelNumber(number), width, height,
    arrows: paths.map((arrow, index) => ({ ...arrow, id: `${id}-arrow-${index + 1}` })) };
  const analysis = analyzeDifficulty(draft);
  if (!analysis.ok || !analysis.solution.solved || !analysis.tier) throw new Error(`${id} is not a validated, solvable onboarding board.`);
  const level = createGameState({ ...draft, difficulty: analysis.tier }, 'zen').level;
  return Object.freeze({ level, concept, analysis, witness: analysis.solution.order });
}

/** Original, explicitly hand-authored cells. No preview artwork or generator used. */
const onboardingData = Object.freeze([
  onboarding(1, 5, 5, 'A single outward exit.', [
    path('right', [2, 2], [3, 2], [4, 2]),
  ]),
  onboarding(2, 6, 6, 'Remove a gate before its blocked neighbour.', [
    path('right', [0, 2], [1, 2], [2, 2]),
    path('up', [4, 3], [4, 2]),
  ]),
  onboarding(3, 6, 6, 'Vertical arrows in both directions; two safe choices.', [
    path('up', [1, 4], [1, 3], [1, 2]),
    path('down', [4, 1], [4, 2], [4, 3]),
    path('right', [0, 0], [1, 0], [2, 0]),
  ]),
  onboarding(4, 7, 7, 'Follow a bent head lane through a three-arrow chain.', [
    path('right', [1, 4], [1, 3], [1, 2], [2, 2], [3, 2]),
    path('up', [5, 3], [5, 2]),
    path('up', [3, 5], [3, 4]),
  ]),
  onboarding(5, 7, 7, 'A body cell can block even when its head points elsewhere.', [
    path('right', [0, 3], [1, 3]),
    path('down', [4, 3], [4, 4], [5, 4], [5, 5]),
    path('up', [2, 6], [2, 5]),
    path('left', [6, 1], [5, 1]),
  ]),
  onboarding(6, 8, 8, 'Two blockers in one lane; the nearer one still matters.', [
    path('right', [0, 3], [1, 3]),
    path('up', [3, 4], [3, 3]),
    path('up', [6, 4], [6, 3]),
    path('right', [2, 1], [3, 1], [4, 1]),
    path('right', [1, 6], [2, 6], [2, 5], [3, 5]),
  ]),
  onboarding(7, 8, 8, 'All four directions and a longer chain with independent exits.', [
    path('right', [0, 2], [1, 2], [2, 2]),
    path('down', [4, 2], [4, 3], [5, 3], [5, 4]),
    path('up', [1, 5], [1, 4]),
    path('down', [6, 5], [6, 6]),
    path('left', [7, 0], [6, 0], [5, 0]),
    path('left', [4, 6], [4, 5], [3, 5], [2, 5]),
  ]),
  onboarding(8, 9, 9, 'Several bent paths and parallel dependency chains.', [
    path('right', [0, 4], [1, 4], [1, 3], [2, 3], [3, 3]),
    path('down', [5, 3], [5, 4], [6, 4], [6, 5]),
    path('up', [2, 7], [2, 6], [2, 5]),
    path('left', [5, 7], [4, 7], [3, 7]),
    path('right', [1, 1], [2, 1], [3, 1]),
    path('up', [8, 7], [8, 6], [8, 5]),
    path('left', [7, 1], [7, 2], [6, 2]),
  ]),
  onboarding(9, 9, 9, 'A cross-lane body blocker extends an earlier chain.', [
    path('right', [0, 4], [1, 4], [1, 3], [2, 3], [3, 3]),
    path('down', [5, 3], [5, 4], [6, 4], [6, 5]),
    path('up', [2, 7], [2, 6], [2, 5]),
    path('left', [5, 7], [4, 7], [3, 7]),
    path('right', [1, 1], [2, 1], [3, 1]),
    path('up', [8, 7], [8, 6], [8, 5]),
    path('left', [7, 1], [7, 2], [6, 2]),
    path('right', [5, 6], [6, 6], [7, 6]),
  ]),
  onboarding(10, 10, 10, 'Ten paths, converging chains, and a boundary exit to start.', [
    path('right', [0, 4], [1, 4], [1, 3], [2, 3], [3, 3]),
    path('down', [5, 3], [5, 4], [6, 4], [6, 5]),
    path('up', [2, 8], [2, 7], [2, 6], [2, 5]),
    path('left', [5, 8], [4, 8], [3, 8]),
    path('right', [1, 1], [2, 1], [3, 1]),
    path('up', [8, 8], [8, 7], [8, 6], [8, 5]),
    path('left', [7, 1], [7, 2], [6, 2]),
    path('right', [4, 6], [5, 6], [6, 6], [7, 6]),
    path('right', [5, 9], [6, 9], [6, 8], [7, 8]),
    path('right', [8, 2], [9, 2]),
  ]),
]);

export const ONBOARDING_LEVELS: readonly Level[] = Object.freeze(onboardingData.map((entry) => entry.level));
export const ONBOARDING_CONCEPTS: readonly string[] = Object.freeze(onboardingData.map((entry) => entry.concept));

/** Positive uint32 level number -> bijective uint32 mixing, version 1. */
export function seedForLevelNumber(levelNumber: number): number {
  if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 0xFFFF_FFFF) throw new RangeError('Level number must be an integer from 1 to 4294967295.');
  let value = (levelNumber ^ 0xF10A71E5) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7FEB352D);
  value = Math.imul(value ^ (value >>> 15), 0x846CA68B);
  return (value ^ (value >>> 16)) >>> 0;
}

export type LevelResult = {
  readonly ok: true;
  readonly source: 'onboarding' | 'procedural';
  readonly level: Level;
  readonly witness: readonly string[];
  readonly analysis: DifficultyAnalysis;
  readonly concept?: string;
  readonly generation?: GeneratedLevel;
} | {
  readonly ok: false;
  readonly reason: 'invalid-level-number' | 'unsupported-difficulty' | 'generation-failed';
  readonly message: string;
  readonly generation?: GenerationFailure;
};

/** Difficulty overrides apply to procedural levels only; onboarding is fixed.
 * Default requested bands: 11..20 easy, 21..40 medium, 41..80 hard, 81+ expert.
 * Every procedural Level stores its measured tier; generation reports mismatches.
 */
export function getLevel(levelNumber: number, difficulty?: Difficulty): LevelResult {
  if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 0xFFFF_FFFF) return { ok: false, reason: 'invalid-level-number', message: 'Level number must be an integer from 1 to 4294967295.' };
  if (difficulty !== undefined && difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard' && difficulty !== 'expert') return { ok: false, reason: 'unsupported-difficulty', message: 'Expected easy, medium, hard, or expert.' };
  if (levelNumber <= 10) return Object.freeze({ ok: true, source: 'onboarding', ...onboardingData[levelNumber - 1]! });
  const requested = difficulty ?? (levelNumber <= 20 ? 'easy' : levelNumber <= 40 ? 'medium' : levelNumber <= 80 ? 'hard' : 'expert');
  const generated = generateLevel(seedForLevelNumber(levelNumber), { difficulty: requested });
  if (!generated.ok) return Object.freeze({ ok: false, reason: 'generation-failed', message: generated.message, generation: generated });
  return Object.freeze({ ok: true, source: 'procedural', level: generated.level,
    witness: generated.witness, analysis: generated.analysis, generation: generated });
}
