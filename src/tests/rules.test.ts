import { describe, expect, it } from 'vitest';
import { buildOccupancy, cellKey, firstBlocker, getSafeArrowIds, MAX_BOARD_DIMENSION, traceExitLane, validateLevel, vectorFor } from '../game/rules';
import { createGameState } from '../game/state';
import type { ArrowPath, Direction, Level } from '../game/types';
import { bentArrow, bentBlockedLevel, bentOpenLevel, chainLevel, fixtureArrow, fixtureLevel, selfRayLevel, singleArrowLevel } from './fixtures/puzzles';

function issueCodes(value: unknown) {
  const result = validateLevel(value);
  expect(result.valid).toBe(false);
  for (const issue of result.issues) {
    expect(issue.path.length).toBeGreaterThan(0);
    expect(issue.message.length).toBeGreaterThan(0);
  }
  return result.issues.map((issue) => issue.code);
}

describe('load-time geometry validation', () => {
  it.each([chainLevel, bentOpenLevel, bentBlockedLevel, singleArrowLevel])('accepts original valid fixtures without changing or repairing them', (level) => {
    const before = structuredClone(level);
    const result = validateLevel(level);
    expect(result).toEqual({ valid: true, level, issues: [] });
    if (result.valid) expect(result.level).toBe(level);
    expect(level).toEqual(before);
  });

  it('allows an empty board, which the state engine can immediately mark won', () => {
    expect(validateLevel(fixtureLevel([], 1, 1)).valid).toBe(true);
  });

  it.each([null, undefined, [], 'board', 7])('rejects a non-object load: %s', (value) => {
    expect(issueCodes(value)).toContain('invalid-level');
  });

  it.each([0, -1, 1.5, NaN, Infinity, '9', MAX_BOARD_DIMENSION + 1])('rejects unsafe dimensions on either axis: %s', (dimension) => {
    expect(issueCodes({ ...chainLevel, width: dimension })).toContain('invalid-dimensions');
    expect(issueCodes({ ...chainLevel, height: dimension })).toContain('invalid-dimensions');
  });

  it('accepts the documented maximum board bound', () => {
    expect(validateLevel({ ...singleArrowLevel, width: MAX_BOARD_DIMENSION, height: MAX_BOARD_DIMENSION }).valid).toBe(true);
  });

  it.each([
    { id: '' }, { id: 42 }, { seed: 0.5 }, { seed: Infinity },
    { seed: Number.MAX_SAFE_INTEGER + 1 }, { difficulty: 'extreme' }, { difficulty: ['easy'] },
  ])('rejects invalid metadata: %j', (metadata) => {
    expect(issueCodes({ ...chainLevel, ...metadata })).toContain('invalid-metadata');
  });

  it('accepts metadata-free levels and preserves optional standard variants', () => {
    const level: Level = { id: 'minimal', width: 4, height: 4, arrows: [{ ...fixtureArrow('a', 'right', [0, 1], [1, 1]), variant: 'standard' }] };
    expect(validateLevel(level).valid).toBe(true);
  });

  it.each([null, {}, 'arrows'])('rejects malformed arrows collections: %s', (arrows) => {
    expect(issueCodes({ ...chainLevel, arrows })).toContain('invalid-arrows');
  });

  it('rejects too many arrows or total cells before scanning excessive data', () => {
    expect(issueCodes({ ...chainLevel, width: 1, height: 1 })).toContain('capacity-exceeded');
    const long = { ...singleArrowLevel.arrows[0], cells: Array.from({ length: 64 }, () => ({ x: 0, y: 0 })) };
    expect(issueCodes({ ...chainLevel, arrows: [long] })).toContain('capacity-exceeded');
  });

  it('rejects null arrows, empty IDs, invalid directions and unsupported variants', () => {
    expect(issueCodes({ ...chainLevel, arrows: [null] })).toContain('invalid-arrow');
    expect(issueCodes(fixtureLevel([fixtureArrow(' ', 'right', [0, 1], [1, 1])]))).toContain('invalid-arrow-id');
    expect(issueCodes({ ...singleArrowLevel, arrows: [{ ...singleArrowLevel.arrows[0], direction: 'diagonal' }] })).toContain('invalid-direction');
    expect(issueCodes({ ...singleArrowLevel, arrows: [{ ...singleArrowLevel.arrows[0], variant: 'special' }] })).toContain('invalid-metadata');
  });

  it.each([[], [{ x: 1, y: 1 }], null, 'cells'])('rejects paths without at least two cells: %j', (cells) => {
    expect(issueCodes({ ...singleArrowLevel, arrows: [{ ...singleArrowLevel.arrows[0], cells }] })).toContain('invalid-cells');
  });

  it.each([null, { x: 1.1, y: 2 }, { x: 1, y: NaN }, { x: '1', y: 2 }, { x: Infinity, y: 2 }])('rejects malformed or non-integer points: %j', (point) => {
    expect(issueCodes({ ...singleArrowLevel, arrows: [{ ...singleArrowLevel.arrows[0], cells: [point, { x: 8, y: 2 }] }] })).toContain('invalid-point');
  });

  it.each([
    fixtureArrow('outside-left', 'right', [-1, 2], [0, 2]),
    fixtureArrow('outside-right', 'right', [8, 2], [9, 2]),
    fixtureArrow('outside-top', 'down', [2, -1], [2, 0]),
    fixtureArrow('outside-bottom', 'down', [2, 6], [2, 7]),
  ])('rejects points outside each edge', (arrow) => {
    expect(issueCodes(fixtureLevel([arrow]))).toContain('out-of-bounds');
  });

  it.each([
    fixtureArrow('diagonal', 'right', [1, 1], [2, 2]),
    fixtureArrow('gap', 'right', [1, 1], [3, 1]),
    fixtureArrow('stationary', 'right', [1, 1], [1, 1]),
  ])('rejects diagonal, gapped or stationary steps', (arrow) => {
    expect(issueCodes(fixtureLevel([arrow]))).toContain('non-adjacent');
  });

  it('rejects an orthogonal self-intersection', () => {
    const arrow = fixtureArrow('loop', 'left', [1, 1], [2, 1], [2, 2], [1, 2], [1, 1], [0, 1]);
    expect(issueCodes(fixtureLevel([arrow]))).toContain('repeated-cell');
  });

  it('rejects overlaps between differently named arrows', () => {
    const result = validateLevel(fixtureLevel([
      fixtureArrow('first', 'right', [1, 2], [2, 2]),
      fixtureArrow('second', 'up', [2, 3], [2, 2]),
    ]));
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({ code: 'overlap', path: 'arrows[1].cells[1]', message: 'Cell (2,2) overlaps arrows[0].' });
  });

  it('rejects duplicate IDs even when their paths do not overlap', () => {
    expect(issueCodes(fixtureLevel([
      fixtureArrow('same', 'right', [1, 2], [2, 2]),
      fixtureArrow('same', 'right', [1, 4], [2, 4]),
    ]))).toContain('duplicate-arrow-id');
  });

  it('rejects a declared direction that differs from the final body segment', () => {
    expect(issueCodes(fixtureLevel([fixtureArrow('wrong', 'up', [1, 2], [2, 2])]))).toContain('head-direction');
  });

  it('rejects the pathological self-head ray even without repeats, gaps, or mismatched heading', () => {
    expect(issueCodes(selfRayLevel)).toEqual(['self-head-ray']);
  });
});

describe('head exit lane and first blocker', () => {
  const directions: { direction: Direction; arrow: ArrowPath; blocker: ArrowPath; lane: [number, number][] }[] = [
    { direction: 'right', arrow: fixtureArrow('a', 'right', [1, 2], [2, 2]), blocker: fixtureArrow('b', 'up', [4, 3], [4, 2]), lane: [[3, 2], [4, 2], [5, 2]] },
    { direction: 'left', arrow: fixtureArrow('a', 'left', [3, 2], [2, 2]), blocker: fixtureArrow('b', 'up', [0, 3], [0, 2]), lane: [[1, 2], [0, 2]] },
    { direction: 'up', arrow: fixtureArrow('a', 'up', [2, 3], [2, 2]), blocker: fixtureArrow('b', 'left', [3, 0], [2, 0]), lane: [[2, 1], [2, 0]] },
    { direction: 'down', arrow: fixtureArrow('a', 'down', [2, 1], [2, 2]), blocker: fixtureArrow('b', 'left', [3, 4], [2, 4]), lane: [[2, 3], [2, 4], [2, 5]] },
  ];

  it.each(directions)('$direction: traces nearest-to-farthest cells and finds a distant blocker', ({ arrow, blocker, lane }) => {
    const level = fixtureLevel([arrow, blocker], 6, 6);
    expect(validateLevel(level).valid).toBe(true);
    expect(traceExitLane(arrow, level)).toEqual(lane.map(([x, y]) => ({ x, y })));
    expect(firstBlocker(arrow, buildOccupancy(level), level)).toBe('b');
    expect(firstBlocker(arrow, buildOccupancy(level, new Set(['a'])), level)).toBeNull();
  });

  it.each([
    fixtureArrow('edge', 'right', [4, 2], [5, 2]),
    fixtureArrow('edge', 'left', [1, 2], [0, 2]),
    fixtureArrow('edge', 'up', [2, 1], [2, 0]),
    fixtureArrow('edge', 'down', [2, 4], [2, 5]),
  ])('has a zero-length, safe exit lane at every outward edge', (arrow) => {
    const level = fixtureLevel([arrow], 6, 6);
    expect(validateLevel(level).valid).toBe(true);
    expect(traceExitLane(arrow, level)).toEqual([]);
    expect(firstBlocker(arrow, buildOccupancy(level), level)).toBeNull();
  });

  it('finds the nearest blocker regardless of arrow order or active Set insertion order', () => {
    const lead = chainLevel.arrows[0]!;
    const before = structuredClone(lead);
    expect(firstBlocker(lead, buildOccupancy(chainLevel), chainLevel)).toBe('near');
    expect(firstBlocker(lead, buildOccupancy(chainLevel, new Set(['unrelated', 'far', 'lead', 'near'])), chainLevel)).toBe('near');
    expect(lead).toEqual(before);
  });

  it('ignores another row and both the bent body bounding box and its rigid translation corridor', () => {
    expect(firstBlocker(bentArrow, buildOccupancy(bentOpenLevel), bentOpenLevel)).toBeNull();
    expect(traceExitLane(bentArrow, bentOpenLevel)).toEqual([{ x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 }]);
  });

  it('allows any body cell of another arrow to block, not only that arrow\'s head', () => {
    expect(firstBlocker(bentArrow, buildOccupancy(bentBlockedLevel), bentBlockedLevel)).toBe('lane-body');
  });

  it('ignores occupancy owned by the attempted arrow; self-ray geometry is separately rejected on load', () => {
    const arrow = fixtureArrow('a', 'right', [1, 2], [2, 2]);
    expect(firstBlocker(arrow, new Map([['3,2', 'a'], ['4,2', 'b']]), { width: 6, height: 6 })).toBe('b');
  });

  it('returns a new active-only occupancy map and does not mutate the input Set', () => {
    const active = new Set(['lead', 'unrelated']);
    const before = [...active];
    expect([...buildOccupancy(chainLevel, active)]).toEqual([
      ['0,2', 'lead'], ['1,2', 'lead'], ['1,5', 'unrelated'], ['2,5', 'unrelated'],
    ]);
    expect([...active]).toEqual(before);
    expect(buildOccupancy(chainLevel)).not.toBe(buildOccupancy(chainLevel));
  });

  it('a removed nearer blocker reveals the next blocker, and removing both unlocks the path', () => {
    const lead = chainLevel.arrows[0]!;
    expect(firstBlocker(lead, buildOccupancy(chainLevel, new Set(['lead', 'far', 'unrelated'])), chainLevel)).toBe('far');
    expect(firstBlocker(lead, buildOccupancy(chainLevel, new Set(['lead', 'unrelated'])), chainLevel)).toBeNull();
  });

  it('protects public lane tracing from unbounded dimensions', () => {
    expect(() => traceExitLane(bentArrow, { width: Infinity, height: 8 })).toThrow(RangeError);
    expect(() => traceExitLane(bentArrow, { width: 8, height: 0 })).toThrow(RangeError);
    expect(() => vectorFor('invalid' as Direction)).toThrow(RangeError);
  });

  it('uses unambiguous cell keys', () => {
    expect(cellKey({ x: 1, y: 23 })).toBe('1,23');
    expect(cellKey({ x: 12, y: 3 })).toBe('12,3');
  });

  it.each([
    { level: chainLevel, expected: ['far', 'near', 'unrelated'] },
    { level: bentOpenLevel, expected: ['bent'] },
    { level: bentBlockedLevel, expected: ['lane-body'] },
    { level: singleArrowLevel, expected: ['only'] },
  ])('lists exactly the geometrically safe arrows for a fixed board', ({ level, expected }) => {
    const state = createGameState(level, 'challenge');
    expect(getSafeArrowIds(state)).toEqual(expected);
    const occupancy = buildOccupancy(level);
    for (const arrow of level.arrows) expect(firstBlocker(arrow, occupancy, level) === null).toBe(expected.includes(arrow.id));
  });

  it('returns no safe IDs for a geometrically valid deadlock; validation does not claim solvability', () => {
    const deadlock = fixtureLevel([
      fixtureArrow('east', 'right', [0, 2], [1, 2]),
      fixtureArrow('west', 'left', [4, 2], [3, 2]),
    ], 5, 5);
    expect(validateLevel(deadlock).valid).toBe(true);
    const state = createGameState(deadlock, 'zen');
    expect(getSafeArrowIds(state)).toEqual([]);
    expect(firstBlocker(deadlock.arrows[0]!, buildOccupancy(deadlock), deadlock)).toBe('west');
    expect(firstBlocker(deadlock.arrows[1]!, buildOccupancy(deadlock), deadlock)).toBe('east');
  });
});
