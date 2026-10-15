import type { ArrowPath, GridPoint } from '../game/types';
import { vectorFor } from '../game/rules';

export interface Curve { readonly points: readonly GridPoint[]; readonly distances: readonly number[]; readonly length: number }
export function curveFor(points: readonly GridPoint[]): Curve {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  return { points, distances, length: distances.at(-1) ?? 0 };
}
export function pointAt(curve: Curve, distance: number): GridPoint {
  if (distance <= 0) return { ...curve.points[0]! };
  for (let i = 1; i < curve.points.length; i++) if (distance <= curve.distances[i]!) {
    const a = curve.points[i - 1]!, b = curve.points[i]!;
    const span = curve.distances[i]! - curve.distances[i - 1]!;
    const t = span ? (distance - curve.distances[i - 1]!) / span : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return { ...curve.points.at(-1)! };
}
export function curveWindow(curve: Curve, start: number, length: number): readonly GridPoint[] {
  const end = start + length;
  return [pointAt(curve, start), ...curve.points.filter((_, i) => curve.distances[i]! > start && curve.distances[i]! < end), pointAt(curve, end)];
}
export interface Extraction { readonly curve: Curve; readonly length: number; readonly travel: number; readonly duration: number }
export interface MotionTiming {
  readonly shortMinMs: number; readonly shortMaxMs: number;
  readonly longMinMs: number; readonly longMaxMs: number;
  readonly baseMs: number; readonly perCellMs: number; readonly perUnitMs: number;
}
export const INTERACTIVE_TIMING: MotionTiming = Object.freeze({ shortMinMs: 300, shortMaxMs: 550,
  longMinMs: 450, longMaxMs: 800, baseMs: 260, perCellMs: 22, perUnitMs: 8 });
/** Distance-aware interactive timing. The legacy geometry API's default remains compatible. */
export function departureDuration(cells: number, travel: number, cellSize: number, timing: MotionTiming = INTERACTIVE_TIMING): number {
  const units = travel / Math.max(1, cellSize);
  return Math.min(cells <= 7 ? timing.shortMaxMs : timing.longMaxMs, Math.max(cells <= 7 ? timing.shortMinMs : timing.longMinMs,
    timing.baseMs + cells * timing.perCellMs + units * timing.perUnitMs));
}
/** Tail travels the original path, then the forward ray beyond the viewport. */
export function extractionFor(arrow: ArrowPath, project: (p: GridPoint) => GridPoint, width: number, height: number, margin: number): Extraction {
  const points = arrow.cells.map(project);
  const original = curveFor(points);
  const head = points.at(-1)!;
  const v = vectorFor(arrow.direction);
  const ray = Math.max(0, v.x > 0 ? width - head.x : v.x < 0 ? head.x : v.y > 0 ? height - head.y : head.y) + margin;
  const travel = original.length + ray;
  const last = { x: head.x + v.x * (travel + original.length), y: head.y + v.y * (travel + original.length) };
  return { curve: curveFor([...points, last]), length: original.length, travel,
    duration: Math.min(450, Math.max(180, 210 + arrow.cells.length * 24)) };
}

export interface FrameClock { request(callback: (time: number) => void): number; cancel(id: number): void }
/** Generation token invalidates even callbacks already queued by the browser. Idle means zero RAF. */
export class EscapeAnimator {
  private token = 0;
  private frame = 0;
  private settle: (() => void) | undefined;
  constructor(private readonly clock: FrameClock) {}
  start(duration: number, draw: (fraction: number) => void, complete: () => void, reducedMotion = false) {
    this.cancel();
    const token = this.token;
    let start: number | undefined;
    const finish = () => {
      if (token !== this.token) return;
      this.cancel();
      draw(1);
      complete();
    };
    this.settle = finish;
    if (reducedMotion) { finish(); return; }
    const tick = (time: number) => {
      if (token !== this.token) return;
      start ??= time;
      const t = Math.min(1, Math.max(0, (time - start) / duration));
      if (t === 1) { finish(); return; }
      draw(t * t * (3 - 2 * t));
      if (token === this.token) this.frame = this.clock.request(tick);
    };
    this.frame = this.clock.request(tick);
  }
  finish() { this.settle?.(); }
  cancel() { this.token++; this.clock.cancel(this.frame); this.frame = 0; this.settle = undefined; }
}
