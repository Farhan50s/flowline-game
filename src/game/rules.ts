import type { ArrowPath, Direction, GameState, GridPoint, Level } from './types';

/** Bounds validation and scans, keeping malformed loads finite and small. */
export const MAX_BOARD_DIMENSION = 128;
export type BoardBounds = Pick<Level, 'width' | 'height'>;
export type Occupancy = ReadonlyMap<string, string>;

export type ValidationCode =
  | 'invalid-level' | 'invalid-dimensions' | 'invalid-metadata' | 'invalid-arrows'
  | 'invalid-arrow' | 'invalid-arrow-id' | 'duplicate-arrow-id' | 'invalid-direction'
  | 'invalid-cells' | 'invalid-point' | 'out-of-bounds' | 'repeated-cell' | 'overlap'
  | 'non-adjacent' | 'head-direction' | 'self-head-ray' | 'capacity-exceeded';

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly path: string;
  readonly message: string;
}

export type LevelValidationResult =
  | { readonly valid: true; readonly level: Level; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly ValidationIssue[] };

export class InvalidLevelError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Invalid level: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
    this.name = 'InvalidLevelError';
    this.issues = issues;
  }
}

const vectors: Readonly<Record<Direction, GridPoint>> = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDirection(value: unknown): value is Direction {
  return value === 'up' || value === 'right' || value === 'down' || value === 'left';
}

function isPoint(value: unknown): value is GridPoint {
  return isRecord(value) && Number.isInteger(value.x) && Number.isInteger(value.y);
}

function isDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_BOARD_DIMENSION;
}

export function cellKey({ x, y }: GridPoint): string {
  return `${x},${y}`;
}

export function vectorFor(direction: Direction): GridPoint {
  if (!isDirection(direction)) throw new RangeError(`Unknown direction: ${String(direction)}`);
  return vectors[direction];
}

/** Excludes the head; includes every in-board cell up to the edge, nearest first.
 * Preconditions: valid path geometry, with its head in bounds. Bounds are checked
 * defensively so accidental malformed dimensions cannot cause an unbounded scan.
 */
export function traceExitLane(arrow: ArrowPath, bounds: BoardBounds): readonly GridPoint[] {
  if (!isDimension(bounds.width) || !isDimension(bounds.height)) {
    throw new RangeError(`Board dimensions must be integers from 1 to ${MAX_BOARD_DIMENSION}.`);
  }
  const head = arrow.cells.at(-1);
  if (!head) throw new RangeError('Cannot trace an arrow without a head.');
  const direction = vectorFor(arrow.direction);
  const lane: GridPoint[] = [];
  for (let x = head.x + direction.x, y = head.y + direction.y;
    x >= 0 && x < bounds.width && y >= 0 && y < bounds.height;
    x += direction.x, y += direction.y) {
    lane.push({ x, y });
  }
  return lane;
}

/** Accepts unknown load data, reports geometry errors without repairing anything. */
export function validateLevel(value: unknown): LevelValidationResult {
  const issues: ValidationIssue[] = [];
  const report = (code: ValidationCode, path: string, message: string) => {
    issues.push({ code, path, message });
  };
  const invalid = (): LevelValidationResult => ({ valid: false, issues });
  if (!isRecord(value)) {
    report('invalid-level', '$', 'Expected a level object.');
    return invalid();
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    report('invalid-metadata', 'id', 'Level ID must be a non-empty string.');
  }
  if (value.seed !== undefined && !Number.isSafeInteger(value.seed)) {
    report('invalid-metadata', 'seed', 'Seed must be a safe integer when provided.');
  }
  if (value.difficulty !== undefined && value.difficulty !== 'easy' && value.difficulty !== 'medium' && value.difficulty !== 'hard' && value.difficulty !== 'expert') {
    report('invalid-metadata', 'difficulty', 'Expected easy, medium, hard, or expert.');
  }
  if (!isDimension(value.width) || !isDimension(value.height)) {
    report('invalid-dimensions', 'width/height', `Board dimensions must be integers from 1 to ${MAX_BOARD_DIMENSION}.`);
    return invalid();
  }
  if (!Array.isArray(value.arrows)) {
    report('invalid-arrows', 'arrows', 'Expected an array of arrow paths.');
    return invalid();
  }
  const capacity = value.width * value.height;
  if (value.arrows.length > Math.floor(capacity / 2)) {
    report('capacity-exceeded', 'arrows', 'Too many arrows: each path needs at least two distinct board cells.');
    return invalid();
  }
  const ids = new Set<string>();
  const owners = new Map<string, number>();
  let totalCells = 0;
  for (const [arrowIndex, rawArrow] of value.arrows.entries()) {
    const path = `arrows[${arrowIndex}]`;
    if (!isRecord(rawArrow)) {
      report('invalid-arrow', path, 'Expected an arrow object.');
      continue;
    }
    if (typeof rawArrow.id !== 'string' || !rawArrow.id.trim()) {
      report('invalid-arrow-id', `${path}.id`, 'Arrow ID must be a non-empty string.');
    } else if (ids.has(rawArrow.id)) {
      report('duplicate-arrow-id', `${path}.id`, `Duplicate arrow ID "${rawArrow.id}".`);
    } else {
      ids.add(rawArrow.id);
    }
    const direction = rawArrow.direction;
    if (!isDirection(direction)) report('invalid-direction', `${path}.direction`, 'Expected up, right, down, or left.');
    if (rawArrow.variant !== undefined && rawArrow.variant !== 'standard') {
      report('invalid-metadata', `${path}.variant`, 'Only the standard arrow variant is supported.');
    }
    if (!Array.isArray(rawArrow.cells) || rawArrow.cells.length < 2) {
      report('invalid-cells', `${path}.cells`, 'An arrow must contain at least two cells, ordered tail to head.');
      continue;
    }
    totalCells += rawArrow.cells.length;
    if (totalCells > capacity) {
      report('capacity-exceeded', `${path}.cells`, 'Total path cells exceed the board capacity; reduce paths or remove repeated/overlapping cells.');
      return invalid();
    }
    const ownCells = new Set<string>();
    let previous: GridPoint | undefined;
    for (const [cellIndex, rawPoint] of rawArrow.cells.entries()) {
      const pointPath = `${path}.cells[${cellIndex}]`;
      if (!isPoint(rawPoint)) {
        report('invalid-point', pointPath, 'Expected integer x/y coordinates.');
        previous = undefined;
        continue;
      }
      if (rawPoint.x < 0 || rawPoint.x >= value.width || rawPoint.y < 0 || rawPoint.y >= value.height) {
        report('out-of-bounds', pointPath, `Cell (${rawPoint.x}, ${rawPoint.y}) is outside the ${value.width}×${value.height} board.`);
      }
      if (previous && Math.abs(rawPoint.x - previous.x) + Math.abs(rawPoint.y - previous.y) !== 1) {
        report('non-adjacent', pointPath, 'Each cell must be exactly one orthogonal step from the previous cell.');
      }
      const key = cellKey(rawPoint);
      if (ownCells.has(key)) report('repeated-cell', pointPath, `Cell (${key}) repeats within this arrow.`);
      ownCells.add(key);
      const owner = owners.get(key);
      if (owner !== undefined && owner !== arrowIndex) {
        report('overlap', pointPath, `Cell (${key}) overlaps arrows[${owner}].`);
      } else {
        owners.set(key, arrowIndex);
      }
      previous = rawPoint;
    }
    const head: unknown = rawArrow.cells.at(-1);
    const penultimate: unknown = rawArrow.cells.at(-2);
    if (isDirection(direction) && isPoint(head) && isPoint(penultimate)) {
      const vector = vectorFor(direction);
      if (head.x - penultimate.x !== vector.x || head.y - penultimate.y !== vector.y) {
        report('head-direction', `${path}.direction`, 'Head direction must match the final tail-to-head segment.');
      }
      // Check own occupancy as well: such a shape must be rejected at load time.
      const headOnly: ArrowPath = { id: '', direction, cells: [head] };
      for (const point of traceExitLane(headOnly, { width: value.width, height: value.height })) {
        if (ownCells.has(cellKey(point))) {
          report('self-head-ray', `${path}.cells`, `The head exit lane hits this arrow's earlier cell (${cellKey(point)}). Change the path or head direction.`);
          break;
        }
      }
    }
  }
  return issues.length ? invalid() : { valid: true, level: value as unknown as Level, issues: [] };
}

/** Validated levels only. Every call returns a fresh map; removed IDs are excluded. */
export function buildOccupancy(level: Level, activeArrowIds?: ReadonlySet<string>): Occupancy {
  const occupancy = new Map<string, string>();
  for (const arrow of level.arrows) {
    if (activeArrowIds && !activeArrowIds.has(arrow.id)) continue;
    for (const point of arrow.cells) occupancy.set(cellKey(point), arrow.id);
  }
  return occupancy;
}

/** Null means clear. Only other active arrows on the forward head ray block. */
export function firstBlocker(arrow: ArrowPath, occupancy: Occupancy, bounds: BoardBounds): string | null {
  for (const point of traceExitLane(arrow, bounds)) {
    const owner = occupancy.get(cellKey(point));
    if (owner !== undefined && owner !== arrow.id) return owner;
  }
  return null;
}

/** Geometry selector, independent of phase; results follow level arrow order.
 * Future input/hint UI must separately gate actions on state.phase === 'ready'.
 */
export function getSafeArrowIds(state: GameState): readonly string[] {
  const occupancy = buildOccupancy(state.level, state.activeArrowIds);
  return state.level.arrows
    .filter((arrow) => state.activeArrowIds.has(arrow.id) && firstBlocker(arrow, occupancy, state.level) === null)
    .map((arrow) => arrow.id);
}
