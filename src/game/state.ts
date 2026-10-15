import { buildOccupancy, firstBlocker, InvalidLevelError, validateLevel } from './rules';
import type { ArrowPath, GameMode, GameState, GridPoint, Level } from './types';

export type MoveResult =
  | { readonly type: 'exiting'; readonly state: GameState; readonly arrowId: string }
  | { readonly type: 'blocked'; readonly state: GameState; readonly arrowId: string; readonly blockerId: string }
  | { readonly type: 'ignored'; readonly state: GameState; readonly reason: 'not-ready' | 'unknown-arrow' | 'inactive-arrow' };

/** Detach the known domain data from caller-owned arrays/points, then freeze it. */
function snapshotLevel(level: Level): Level {
  const arrows = level.arrows.map((arrow): ArrowPath => {
    const cells = arrow.cells.map((point) => Object.freeze({ x: point.x, y: point.y }));
    return Object.freeze({
      ...arrow,
      cells: Object.freeze(cells as [GridPoint, ...GridPoint[]]),
    });
  });
  return Object.freeze({ ...level, arrows: Object.freeze(arrows) });
}

/** Throws InvalidLevelError for invalid geometry; never repairs or regenerates. */
export function createGameState(level: Level, mode: GameMode): GameState {
  const validation = validateLevel(level);
  if (!validation.valid) throw new InvalidLevelError(validation.issues);
  if (mode !== 'challenge' && mode !== 'zen') throw new RangeError(`Unknown game mode: ${String(mode)}`);
  const snapshot = snapshotLevel(validation.level);
  return Object.freeze({
    level: snapshot,
    activeArrowIds: new Set(snapshot.arrows.map((arrow) => arrow.id)),
    mode,
    hearts: 3,
    moves: 0,
    mistakes: 0,
    phase: snapshot.arrows.length ? 'ready' : 'won',
  });
}

/** One pure attempt. Ignored input returns the exact incoming state reference. */
export function attemptMove(state: GameState, arrowId: string): MoveResult {
  if (state.phase !== 'ready') return { type: 'ignored', state, reason: 'not-ready' };
  const arrow = state.level.arrows.find((candidate) => candidate.id === arrowId);
  if (!arrow) return { type: 'ignored', state, reason: 'unknown-arrow' };
  if (!state.activeArrowIds.has(arrowId)) return { type: 'ignored', state, reason: 'inactive-arrow' };
  const blockerId = firstBlocker(arrow, buildOccupancy(state.level, state.activeArrowIds), state.level);
  if (blockerId !== null) {
    const hearts = state.mode === 'challenge' ? Math.max(0, state.hearts - 1) : state.hearts;
    const next: GameState = Object.freeze({
      ...state,
      moves: state.moves + 1,
      mistakes: state.mistakes + 1,
      hearts,
      phase: state.mode === 'challenge' && hearts === 0 ? 'lost' : 'ready',
    });
    return { type: 'blocked', state: next, arrowId, blockerId };
  }
  const next: GameState = Object.freeze({
    ...state,
    moves: state.moves + 1,
    phase: 'animating',
    pendingArrowId: arrowId,
  });
  return { type: 'exiting', state: next, arrowId };
}

/** Only a valid pending escape in animating phase commits removal.
 * No pending escape, wrong phase, or inactive pending ID => exact no-op.
 * The animation caller must supply its current state; no timers run here.
 */
export function completeEscape(state: GameState): GameState {
  const { pendingArrowId, ...rest } = state;
  if (state.phase !== 'animating' || pendingArrowId === undefined || !state.activeArrowIds.has(pendingArrowId)) return state;
  const activeArrowIds = new Set(state.activeArrowIds);
  activeArrowIds.delete(pendingArrowId);
  return Object.freeze({
    ...rest,
    activeArrowIds,
    phase: activeArrowIds.size === 0 ? 'won' : 'ready',
  });
}

/** Restores the same data/metadata and mode; no PRNG or external state involved. */
export function restartLevel(state: GameState): GameState {
  return createGameState(state.level, state.mode);
}
