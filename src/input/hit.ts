import type { ArrowPath, GridPoint } from '../game/types';
import type { ScreenRect } from '../graphics/mobile-layout';

export function segmentDistance(point: GridPoint, a: GridPoint, b: GridPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** Nearest actual segment; exact ties retain stable Level order. No bounding-box hits. */
export function hitArrow(point: GridPoint, arrows: readonly ArrowPath[], active: ReadonlySet<string>,
  project: (point: GridPoint) => GridPoint, radius = 12): string | undefined {
  let best = radius + Number.EPSILON, id: string | undefined;
  for (const arrow of arrows) {
    if (!active.has(arrow.id)) continue;
    for (let i = 1; i < arrow.cells.length; i++) {
      const distance = segmentDistance(point, project(arrow.cells[i - 1]!), project(arrow.cells[i]!));
      if (distance <= radius && (id === undefined || distance < best - 1e-7)) { best = distance; id = arrow.id; }
    }
  }
  return id;
}

export type TouchTarget = { readonly type: 'miss' } | { readonly type: 'ambiguous'; readonly ids: readonly string[] }
  | { readonly type: 'selected'; readonly id: string };

/** A finger-sized search radius must not silently charge the nearest of two plausible paths. */
export function clippedSegment(a: GridPoint, b: GridPoint, rect: ScreenRect): readonly [GridPoint, GridPoint] | undefined {
  let start = 0, end = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - rect.x], [dx, rect.x + rect.width - a.x], [-dy, a.y - rect.y], [dy, rect.y + rect.height - a.y]]) {
    if (p === 0) { if (q! < 0) return; continue; }
    const t = q! / p!;
    if (p! < 0) start = Math.max(start, t); else end = Math.min(end, t);
    if (start > end) return;
  }
  return [{ x: a.x + dx * start, y: a.y + dy * start }, { x: a.x + dx * end, y: a.y + dy * end }];
}
export function touchTarget(point: GridPoint, arrows: readonly ArrowPath[], active: ReadonlySet<string>,
  project: (point: GridPoint) => GridPoint, radius = 22, clip?: ScreenRect): TouchTarget {
  const candidates = arrows.filter(a => active.has(a.id)).map(arrow => ({ id: arrow.id,
    distance: Math.min(...arrow.cells.slice(1).map((p, i) => {
      const a = project(arrow.cells[i]!), b = project(p);
      const segment = clip ? clippedSegment(a, b, clip) : [a, b];
      return segment ? segmentDistance(point, segment[0]!, segment[1]!) : Infinity;
    })) }))
    .filter(hit => hit.distance <= radius).sort((a, b) => a.distance - b.distance);
  const first = candidates[0];
  if (!first) return { type: 'miss' };
  // A precise stroke contact is distinct; broad near-ties ask the player to zoom.
  const close = candidates.filter(candidate => candidate.distance - first.distance <= 7);
  if (close.length > 1) return { type: 'ambiguous', ids: close.map(hit => hit.id) };
  return { type: 'selected', id: first.id };
}
