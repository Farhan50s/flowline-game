import type { GameState, GridPoint } from '../game/types';
import { buildOccupancy, cellKey, firstBlocker, traceExitLane } from '../game/rules';
import { curveFor, pointAt } from './animation';

export interface TrailPoint { readonly point: GridPoint; readonly distance: number }
/** World-space samples, computed once per departure. No new game objects or hit targets. */
export function sourceTrail(points: readonly GridPoint[]): readonly TrailPoint[] {
  const curve = curveFor(points), count = Math.min(1023, Math.ceil(curve.length * 2));
  if (!count) return [];
  return Array.from({ length: count + 1 }, (_, index) => {
    const distance = index * curve.length / count;
    return { point: pointAt(curve, distance), distance };
  });
}
/** Positive clearance keeps dots behind the round tail cap, never under the body. */
export function trailOpacity(distance: number, tail: number, clearance = .16): number {
  return Math.max(0, Math.min(1, (tail - distance - clearance) / .24));
}
export function lanePreview(state: GameState, id: string) {
  if (state.phase !== 'ready' || !state.activeArrowIds.has(id)) return;
  const arrow = state.level.arrows.find(a => a.id === id);
  if (!arrow) return;
  const occupancy = buildOccupancy(state.level, state.activeArrowIds);
  const lane = [...traceExitLane(arrow, state.level)];
  const blockerId = firstBlocker(arrow, occupancy, state.level);
  const contact = blockerId === null ? undefined : lane.find(point => occupancy.get(cellKey(point)) === blockerId);
  return { arrow, lane, blockerId, contact };
}
