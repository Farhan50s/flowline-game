import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { generateLevel } from '../game/generator';
import { analyzeDifficulty } from '../game/difficulty';
import { buildOccupancy, getSafeArrowIds, validateLevel } from '../game/rules';
import { solveLevel } from '../game/solver';
import { attemptMove, completeEscape, createGameState } from '../game/state';
import type { Difficulty } from '../game/types';
import type { GeneratedLevel, GenerationFailure } from '../game/generator';

const tiers: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const cases = tiers.flatMap((difficulty, index) => Array.from({ length: 250 }, (_, offset) => ({ difficulty, seed: index * 250 + offset })));
interface RecordRow {
  difficulty: Difficulty;
  seed: number;
  generationMs: number;
  verified: boolean;
  result: GeneratedLevel | GenerationFailure;
}
const records: RecordRow[] = [];

describe('1,000 distinct deterministic seeds through all standard profiles', () => {
  it.each(cases)('$difficulty seed $seed validates, obeys reverse construction and solves independently', ({ seed, difficulty }) => {
    const started = performance.now();
    const result = generateLevel(seed, { difficulty });
    const record = { seed, difficulty, generationMs: performance.now() - started, result, verified: false };
    records.push(record);
    expect(result.ok, `${difficulty}:${seed} ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) throw new Error(result.message);
    const level = result.level;
    expect(validateLevel(level).valid).toBe(true);
    expect(level.arrows.length).toBeGreaterThan(0);
    expect(buildOccupancy(level).size).toBe(result.analysis.metrics.occupiedCells);
    expect(result.analysis.metrics.cyclic).toBe(false);
    expect(result.analysis.metrics.bentArrowCount).toBeGreaterThan(0);
    expect(result.analysis.metrics.bentArrowCount).toBeLessThan(level.arrows.length);
    expect(level.difficulty).toBe(result.analysis.tier);
    expect(result.matchesRequestedDifficulty).toBe(result.analysis.tier === difficulty);
    const insertionIndex = new Map(level.arrows.map((arrow, index) => [arrow.id, index]));
    for (const dependency of result.analysis.dependencies) for (const blocker of dependency.blockerIds) {
      expect(insertionIndex.get(blocker)!).toBeGreaterThan(insertionIndex.get(dependency.arrowId)!);
    }
    expect(result.witness).toEqual(level.arrows.map((arrow) => arrow.id).reverse());
    let state = createGameState(level, 'challenge');
    for (const id of result.witness) {
      expect(getSafeArrowIds(state)).toContain(id);
      const count = state.activeArrowIds.size;
      const attempt = attemptMove(state, id);
      expect(attempt.type).toBe('exiting');
      expect(attempt.state.activeArrowIds.size).toBe(count);
      expect(attempt.state.pendingArrowId).toBe(id);
      state = completeEscape(attempt.state);
      expect(state.activeArrowIds.size).toBe(count - 1);
    }
    expect(state).toMatchObject({ phase: 'won', hearts: 3, mistakes: 0, moves: level.arrows.length });
    const independent = solveLevel({ ...level, seed: 123 });
    expect(independent.solved).toBe(true);
    expect(independent.order).toHaveLength(level.arrows.length);
    expect(new Set(independent.order).size).toBe(level.arrows.length);
    expect(analyzeDifficulty(level)).toEqual(result.analysis);
    record.verified = true;
  });
});

afterAll(() => {
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const summaries = tiers.map((tier, index) => {
    const rows = records.filter((row) => row.difficulty === tier);
    const successes = rows.filter((row): row is RecordRow & { result: GeneratedLevel } => row.result.ok);
    const times = rows.map((row) => row.generationMs).sort((a, b) => a - b);
    const metrics = successes.map((row) => row.result.analysis.metrics);
    const bands = Object.fromEntries(tiers.map((band) => [band, successes.filter((row) => row.result.analysis.tier === band).length]));
    return {
      profile: tier, seedRange: [index * 250, index * 250 + 249], cases: rows.length,
      generated: successes.length, verified: rows.filter((row) => row.verified).length,
      failures: rows.filter((row) => !row.verified).map((row) => ({ seed: row.seed, reason: row.result.ok ? 'verification-failed' : row.result.reason })),
      actualTiers: bands, matchedRequested: successes.filter((row) => row.result.matchesRequestedDifficulty).length,
      uniqueLayouts: new Set(successes.map((row) => JSON.stringify(row.result.level.arrows.map(({ direction, cells }) => ({ direction, cells }))))).size,
      meanArrows: mean(metrics.map((m) => m.arrowCount)), meanDensity: mean(metrics.map((m) => m.density)),
      meanBends: mean(metrics.map((m) => m.meanTurns)), meanRelationships: mean(metrics.map((m) => m.blockingRelationships)),
      meanChain: mean(metrics.map((m) => m.longestChain ?? 0)), meanInitialSafeFraction: mean(metrics.map((m) => m.initialSafeFraction)),
      meanForcedFraction: mean(metrics.map((m) => m.forcedChoiceFraction)), meanScore: mean(successes.map((row) => row.result.analysis.score!)),
      meanGenerationMs: mean(times), medianGenerationMs: times[Math.floor(times.length / 2)] ?? 0,
      p95GenerationMs: times[Math.max(0, Math.ceil(times.length * 0.95) - 1)] ?? 0, maxGenerationMs: Math.max(0, ...times),
      totalGenerationMs: times.reduce((sum, value) => sum + value, 0),
      proposals: rows.reduce((sum, row) => sum + row.result.stats.proposals, 0),
      rejectedProposals: rows.reduce((sum, row) => sum + row.result.stats.rejectedProposals, 0),
      rejectedLevels: rows.reduce((sum, row) => sum + row.result.stats.rejectedLevels, 0),
      invalidGeometryProposals: rows.reduce((sum, row) => sum + row.result.stats.invalidGeometry, 0),
    };
  });
  const report = { runtime: process.version, platform: platform(), cpu: cpus()[0]?.model ?? 'unavailable',
    recipe: 'procedural-v1', note: 'Timing wraps generateLevel only, including its analyzer/solver/witness verification. Vitest Node worker, not an Android device benchmark.',
    totalCases: records.length, generated: records.filter((row) => row.result.ok).length,
    verified: records.filter((row) => row.verified).length, profiles: summaries };
  writeFileSync(new URL('../../docs/verification/PHASE_03_SEED_SAMPLE.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  const lines = [
    '# Phase 03 deterministic seed sample', '',
    `Runtime: ${report.runtime}; OS: ${report.platform}; CPU: ${report.cpu}.`, '',
    report.note, '', `Cases: ${report.totalCases}; generated: ${report.generated}; fully verified: ${report.verified}.`, '',
    '| Requested profile | Seeds | Verified | Mean score | Mean arrows | Mean density | Mean chain | Mean ms | p95 ms | Max ms | Tier matches |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map((row) => `| ${row.profile} | ${row.seedRange.join('–')} | ${row.verified}/${row.cases} | ${row.meanScore.toFixed(2)} | ${row.meanArrows.toFixed(2)} | ${(row.meanDensity * 100).toFixed(1)}% | ${row.meanChain.toFixed(2)} | ${row.meanGenerationMs.toFixed(2)} | ${row.p95GenerationMs.toFixed(2)} | ${row.maxGenerationMs.toFixed(2)} | ${row.matchedRequested}/${row.generated} |`), '',
    'The JSON report includes actual tier distributions, layout diversity, choice/bend/dependency metrics, rejection totals and explicit failure seeds. Timing varies with CPU load and JIT warmup.', '',
  ];
  writeFileSync(new URL('../../docs/PHASE_03_SEED_SAMPLE.md', import.meta.url), lines.join('\n'));
  expect(records).toHaveLength(1000);
  expect(report.verified).toBe(1000);
  for (const row of summaries) expect(row.uniqueLayouts).toBeGreaterThanOrEqual(240);
  for (let index = 1; index < summaries.length; index++) {
    expect(summaries[index]!.meanScore).toBeGreaterThan(summaries[index - 1]!.meanScore);
    expect(summaries[index]!.meanRelationships).toBeGreaterThan(summaries[index - 1]!.meanRelationships);
  }
});
