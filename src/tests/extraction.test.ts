import { describe, expect, it, vi } from 'vitest';
import { curveFor, curveWindow, EscapeAnimator, extractionFor, pointAt } from '../graphics/animation';
import type { FrameClock } from '../graphics/animation';
import type { ArrowPath, Direction } from '../game/types';

const points = [{ x: 0, y: 20 }, { x: 0, y: 0 }, { x: 20, y: 0 }];
describe('continuous snake windows', () => {
  it('keeps 90-degree body on its original centerline, never translating the bend', () => {
    const curve = curveFor([...points, { x: 100, y: 0 }]);
    expect(curveWindow(curve, 0, 40)).toEqual(points);
    expect(curveWindow(curve, 10, 40)).toEqual([{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }]);
    expect(curveFor(curveWindow(curve, 10, 40)).length).toBe(40);
    expect(curveWindow(curve, 40, 40)).toEqual([{ x: 20, y: 0 }, { x: 60, y: 0 }]);
  });
  it('preserves length through multiple bends at fractional travel distances', () => {
    const curve = curveFor([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 100, y: 20 }]);
    for (const distance of [0, 2.7, 9.9, 10, 15, 20, 25, 31, 50]) {
      const body = curveWindow(curve, distance, 30);
      expect(curveFor(body).length).toBeCloseTo(30, 8);
      for (let i = 1; i < body.length; i++) expect(body[i]!.x === body[i - 1]!.x || body[i]!.y === body[i - 1]!.y).toBe(true);
    }
  });
  it.each<Direction>(['up', 'right', 'down', 'left'])('extracts fully outside a narrow viewport facing %s', direction => {
    const head = { x: 30, y: 30 };
    const tails = { up: { x: 30, y: 50 }, right: { x: 10, y: 30 }, down: { x: 30, y: 10 }, left: { x: 50, y: 30 } };
    const arrow: ArrowPath = { id: 'a', direction, cells: [tails[direction], head] };
    const original = JSON.stringify(arrow);
    const ex = extractionFor(arrow, p => p, 60, 60, 10);
    expect(curveWindow(ex.curve, 0, ex.length)).toEqual(arrow.cells);
    const tail = curveWindow(ex.curve, ex.travel, ex.length)[0]!;
    expect(direction === 'up' ? tail.y < 0 : direction === 'down' ? tail.y > 60 : direction === 'left' ? tail.x < 0 : tail.x > 60).toBe(true);
    expect(ex.duration).toBeGreaterThanOrEqual(180); expect(ex.duration).toBeLessThanOrEqual(450);
    expect(JSON.stringify(arrow)).toBe(original);
  });
  it('accounts for a head initially outside the zoomed viewport', () => {
    const a: ArrowPath = { id: 'a', direction: 'right', cells: [{ x: 180, y: 30 }, { x: 200, y: 30 }] };
    const ex = extractionFor(a, p => p, 60, 60, 10);
    expect(pointAt(ex.curve, ex.travel).x).toBeGreaterThan(60);
  });
  it('clamps curve samples to end points and returns copies', () => {
    const curve = curveFor(points); expect(pointAt(curve, -1)).toEqual(points[0]); expect(pointAt(curve, 100)).toEqual(points.at(-1));
    expect(pointAt(curve, 0)).not.toBe(points[0]);
  });
});

function clock() {
  let id = 0;
  const pending = new Map<number, (time: number) => void>();
  const port: FrameClock = { request(fn) { pending.set(++id, fn); return id; }, cancel(i) { pending.delete(i); } };
  return { port, pending, step(time: number) { const frames = [...pending.values()]; pending.clear(); for (const fn of frames) fn(time); } };
}
describe('finite frame lifecycle', () => {
  it('draws eased start/mid/end, completes once, then has no idle RAF', () => {
    const c = clock(), animator = new EscapeAnimator(c.port), draw = vi.fn(), complete = vi.fn();
    animator.start(300, draw, complete); c.step(100); expect(draw).toHaveBeenLastCalledWith(0);
    c.step(250); expect(draw).toHaveBeenLastCalledWith(.5); expect(complete).not.toHaveBeenCalled();
    const stale = [...c.pending.values()][0]!; c.step(400); stale(500); animator.finish();
    expect(draw).toHaveBeenLastCalledWith(1); expect(complete).toHaveBeenCalledTimes(1); expect(c.pending.size).toBe(0);
  });
  it.each(['restart', 'home', 'unmount', 'settings', 'interruption'])('%s invalidates callbacks already in flight', () => {
    const c = clock(), animator = new EscapeAnimator(c.port), complete = vi.fn(), draw = vi.fn();
    animator.start(200, draw, complete); const stale = [...c.pending.values()][0]!; animator.cancel(); stale(0); stale(1000);
    expect(draw).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled(); expect(c.pending.size).toBe(0);
  });
  it('new extraction cannot be completed by an old frame', () => {
    const c = clock(), animator = new EscapeAnimator(c.port), first = vi.fn(), second = vi.fn();
    animator.start(200, () => {}, first); const stale = [...c.pending.values()][0]!;
    animator.start(200, () => {}, second); stale(1000); c.step(0); c.step(200);
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])('reduced-motion %s settles exactly once, including a mid-flight toggle', initial => {
    const c = clock(), animator = new EscapeAnimator(c.port), complete = vi.fn();
    animator.start(300, () => {}, complete, initial); const stale = [...c.pending.values()][0];
    if (!initial) { c.step(0); animator.finish(); }
    animator.finish(); stale?.(500);
    expect(complete).toHaveBeenCalledTimes(1); expect(c.pending.size).toBe(0);
  });
});
