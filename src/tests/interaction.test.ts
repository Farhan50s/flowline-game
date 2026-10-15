import { describe, expect, it } from 'vitest';
import { BoardGesture } from '../input/gestures';
import { hitArrow, segmentDistance } from '../input/hit';
import { boardTransform, boundView, HOME_VIEW, MAX_ZOOM, zoomAt } from '../graphics/viewport';
import { backingSize } from '../graphics/geometry';
import { getLevel } from '../game/levels';
import type { ArrowPath } from '../game/types';

const space = { width: 300, height: 400, columns: 7, rows: 7 };
const identity = (p: { x: number; y: number }) => p;
const arrow = (id: string, y: number): ArrowPath => ({ id, direction: 'right', cells: [{ x: 0, y }, { x: 10, y }] });
describe('CSS coordinates, resizing and nearest-path targeting', () => {
  it.each([1, 1.25, 2, 3])('DPR %s changes backing size without changing inverse input coordinates', dpr => {
    const t = boardTransform(space, { zoom: 2.2, x: 23, y: -41 });
    const world = { x: 3.27, y: 4.88 };
    const css = t.toCSS(world);
    expect(t.toWorld(css).x).toBeCloseTo(world.x, 10);
    expect(t.toWorld(css).y).toBeCloseTo(world.y, 10);
    expect(backingSize(space.width, space.height, dpr)).toEqual({ width: Math.round(300 * dpr), height: Math.round(400 * dpr) });
    expect(t.toWorld(css)).toEqual(boardTransform(space, { zoom: 2.2, x: 23, y: -41 }).toWorld(css));
  });
  it.each([1, 4, 10, 11, 81])('real level %s fits portrait/landscape and remains hittable after resizing', number => {
    const result = getLevel(number); expect(result.ok).toBe(true); if (!result.ok) return;
    for (const [width, height] of [[284, 278], [342, 554], [382, 642], [360, 342], [640, 530]]) {
      const s = { width: width!, height: height!, columns: result.level.width, rows: result.level.height };
      const t = boardTransform(s);
      for (const path of result.level.arrows) for (const point of path.cells) {
        const css = t.toCSS(point);
        expect(css.x).toBeGreaterThan(0); expect(css.x).toBeLessThan(s.width);
        expect(css.y).toBeGreaterThan(0); expect(css.y).toBeLessThan(s.height);
        expect(hitArrow(css, result.level.arrows, new Set(result.level.arrows.map(a => a.id)), t.toCSS, 8)).toBe(path.id);
      }
    }
  });
  it('projects a zoomed/panned bent segment for hit testing', () => {
    const a: ArrowPath = { id: 'bend', direction: 'right', cells: [{ x: 1, y: 3 }, { x: 1, y: 2 }, { x: 2, y: 2 }] };
    const t = boardTransform(space, { zoom: 3, x: -40, y: 80 });
    expect(hitArrow(t.toCSS({ x: 1, y: 2.5 }), [a], new Set(['bend']), t.toCSS)).toBe('bend');
    expect(hitArrow(t.toCSS({ x: 1.8, y: 2.8 }), [a], new Set(['bend']), t.toCSS, 12)).toBeUndefined();
  });
  it('selects nearest path independently of storage order and stable ties', () => {
    const arrows = [arrow('first', 0), arrow('second', 4)];
    expect(hitArrow({ x: 5, y: 3 }, arrows, new Set(['first', 'second']), identity, 5)).toBe('second');
    expect(hitArrow({ x: 5, y: 2 }, arrows, new Set(['first', 'second']), identity, 5)).toBe('first');
    expect(hitArrow({ x: 5, y: 3 }, arrows, new Set(['first']), identity, 2)).toBeUndefined();
  });
  it('rejects the empty bounding-box corner and a tiny disconnected gap', () => {
    const bend: ArrowPath = { id: 'b', direction: 'right', cells: [{ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }] };
    expect(hitArrow({ x: 8, y: 8 }, [bend], new Set(['b']), identity, 2)).toBeUndefined();
    expect(hitArrow({ x: 10.5, y: 0 }, [arrow('a', 0)], new Set(['a']), identity, .4)).toBeUndefined();
  });
  it('uses clamped projection at end points and handles degenerate segments', () => {
    expect(segmentDistance({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(segmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
    expect(segmentDistance({ x: 4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
  it('bounds zoom and pan, with reset returning all paths to a recoverable fit', () => {
    expect(boundView({ zoom: 100, x: 1e6, y: -1e6 }, space)).toEqual({ zoom: MAX_ZOOM, x: 450, y: -600 });
    expect(boundView({ zoom: .1, x: 100, y: -100 }, space)).toEqual(HOME_VIEW);
    expect(boundView({ zoom: NaN, x: Infinity, y: NaN }, space)).toEqual(HOME_VIEW);
  });
  it('anchors wheel/pinch zoom to the same world point when within pan limits', () => {
    const anchor = { x: 180, y: 230 };
    const before = boardTransform(space).toWorld(anchor);
    const after = boardTransform(space, zoomAt(HOME_VIEW, 2, anchor, space)).toWorld(anchor);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
  });
});

describe('tap / drag / multitouch recognition', () => {
  it('tolerates small jitter and emits only one tap', () => {
    const g = new BoardGesture(HOME_VIEW, space);
    g.down(1, { x: 20, y: 30 }); g.move(1, { x: 24, y: 32 });
    expect(g.up(1, { x: 24, y: 32 })).toEqual({ x: 24, y: 32 });
    expect(g.up(1, { x: 24, y: 32 })).toBeUndefined();
  });
  it.each([1, 2])('movement at zoom %s suppresses a tap even after returning to start', zoom => {
    const g = new BoardGesture({ zoom, x: 0, y: 0 }, space);
    g.down(1, { x: 50, y: 60 }); g.move(1, { x: 70, y: 60 }); g.move(1, { x: 50, y: 60 });
    expect(g.up(1, { x: 50, y: 60 })).toBeUndefined();
  });
  it('up without move still rejects a distant endpoint', () => {
    const g = new BoardGesture(HOME_VIEW, space); g.down(1, { x: 0, y: 0 });
    expect(g.up(1, { x: 20, y: 0 })).toBeUndefined();
  });
  it('two stationary pointers suppress both taps and a subsequent single-finger release', () => {
    const g = new BoardGesture(HOME_VIEW, space); g.down(1, { x: 10, y: 10 }); g.down(2, { x: 20, y: 20 });
    expect(g.up(2, { x: 20, y: 20 })).toBeUndefined(); expect(g.up(1, { x: 10, y: 10 })).toBeUndefined();
    g.down(3, { x: 10, y: 10 }); expect(g.up(3, { x: 10, y: 10 })).toBeDefined();
  });
  it('pinches and pans with a stable midpoint, clamping extreme gestures', () => {
    const g = new BoardGesture(HOME_VIEW, space);
    g.down(1, { x: 100, y: 200 }); g.down(2, { x: 200, y: 200 });
    const view = g.move(2, { x: 300, y: 200 }); expect(view.zoom).toBe(2); expect(view.x).toBe(50);
    expect(g.move(2, { x: 10000, y: 200 }).zoom).toBe(4);
    expect(g.up(1, { x: 100, y: 200 })).toBeUndefined(); expect(g.up(2, { x: 10000, y: 200 })).toBeUndefined();
  });
  it('single-finger pan is bounded and cancellation/reconfiguration discards pending taps', () => {
    const g = new BoardGesture({ zoom: 2, x: 0, y: 0 }, space);
    g.down(1, { x: 100, y: 100 }); expect(g.move(1, { x: 1000, y: 1000 })).toEqual({ zoom: 2, x: 150, y: 200 });
    g.cancel(); expect(g.up(1, { x: 1000, y: 1000 })).toBeUndefined();
    g.down(1, { x: 0, y: 0 }); g.configure(HOME_VIEW, space); expect(g.up(1, { x: 0, y: 0 })).toBeUndefined();
  });
});
