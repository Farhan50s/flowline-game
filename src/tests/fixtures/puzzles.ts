import type { ArrowPath, Direction, Level } from '../../game/types';

/** Original, hand-authored engine fixtures. Not shipped or selectable levels. */
export function fixtureArrow(id: string, direction: Direction, ...coordinates: [number, number][]): ArrowPath {
  const cells = coordinates.map(([x, y]) => ({ x, y }));
  const first = cells[0];
  if (!first) throw new Error('A fixture arrow needs a cell.');
  return { id, direction, cells: [first, ...cells.slice(1)] };
}

export function fixtureLevel(arrows: readonly ArrowPath[], width = 9, height = 7): Level {
  return { id: 'test-only', width, height, seed: 31415, difficulty: 'medium', arrows };
}

// Storage order deliberately puts the farther blocker before the nearer one.
export const chainLevel = fixtureLevel([
  fixtureArrow('lead', 'right', [0, 2], [1, 2]),
  fixtureArrow('far', 'up', [7, 3], [7, 2]),
  fixtureArrow('near', 'up', [4, 3], [4, 2]),
  fixtureArrow('unrelated', 'right', [1, 5], [2, 5]),
]);

// Rigidly translating the bent body right would run into off-lane. The actual
// head lane is y=3, so only lane-body can block this arrow's extraction.
export const bentArrow = fixtureArrow('bent', 'right', [1, 5], [1, 4], [1, 3], [2, 3], [3, 3]);
export const bentOpenLevel = fixtureLevel([
  bentArrow,
  fixtureArrow('off-lane', 'left', [4, 5], [3, 5]),
], 8, 8);
export const bentBlockedLevel = fixtureLevel([
  ...bentOpenLevel.arrows,
  fixtureArrow('lane-body', 'up', [6, 3], [6, 2]),
], 8, 8);

export const singleArrowLevel = fixtureLevel([
  fixtureArrow('only', 'right', [7, 2], [8, 2]),
]);

// Valid orthogonal, non-repeating geometry, but the head at (3,2) points right
// into its own tail at (4,2). Must be rejected rather than treated as playable.
export const selfRayLevel = fixtureLevel([
  fixtureArrow('folded', 'right', [4, 2], [4, 3], [3, 3], [2, 3], [2, 2], [3, 2]),
]);
