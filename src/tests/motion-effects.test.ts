import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardGesture } from '../input/gestures';
import { HOME_VIEW } from '../graphics/viewport';
import { curveFor, curveWindow, departureDuration, extractionFor, INTERACTIVE_TIMING, pointAt } from '../graphics/animation';
import { lanePreview, sourceTrail, trailOpacity } from '../graphics/path-effects';
import { createGameState } from '../game/state';
import { bentBlockedLevel, fixtureArrow } from './fixtures/puzzles';

const space = { width: 390, height: 844, columns: 7, rows: 7 };
const p = { x: 100, y: 200 };
function press() {
  vi.useFakeTimers();
  const preview = vi.fn(); let now = 0;
  const gesture = new BoardGesture(HOME_VIEW, space, { preview, ready: () => true, now: () => now });
  return { gesture, preview, advance(ms: number) { now += ms; vi.advanceTimersByTime(ms); } };
}
afterEach(() => vi.useRealTimers());
describe('coordinated tap / hold / gesture state machine', () => {
  it.each([0, 80, 219])('releases at %sms as exactly one tap, with no preview', ms => {
    const h = press(); h.gesture.down(1, p, 'a'); h.advance(ms);
    expect(h.gesture.up(1, p)).toEqual(p); expect(h.gesture.up(1, p)).toBeUndefined();
    expect(h.preview.mock.calls.some(([id]) => id === 'a')).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([220, 221, 800])('holds at %sms and release never returns a tap', ms => {
    const h = press(); h.gesture.down(1, p, 'a'); h.advance(ms);
    expect(h.preview).toHaveBeenLastCalledWith('a'); expect(h.gesture.up(1, p)).toBeUndefined();
    expect(h.preview).toHaveBeenLastCalledWith(undefined); expect(vi.getTimerCount()).toBe(0);
  });
  it('checks elapsed time even if the hold timer was delayed by a busy browser', () => {
    let now = 0; const preview = vi.fn();
    const gesture = new BoardGesture(HOME_VIEW, space, { preview, ready: () => true, now: () => now });
    gesture.down(1, p, 'a'); now = 500; expect(gesture.up(1, p)).toBeUndefined();
  });
  it.each(['drag', 'second pointer', 'cancel', 'configure'])('%s before threshold invalidates the timer and tap permanently', reason => {
    const h = press(); h.gesture.down(1, p, 'a'); h.advance(100);
    if (reason === 'drag') h.gesture.move(1, { x: 109, y: 200 });
    if (reason === 'second pointer') h.gesture.down(2, { x: 200, y: 200 }, 'b');
    if (reason === 'cancel') h.gesture.cancel();
    if (reason === 'configure') h.gesture.configure(HOME_VIEW, space);
    h.advance(600); expect(h.gesture.up(1, p)).toBeUndefined(); expect(h.gesture.up(2, p)).toBeUndefined();
    expect(h.preview.mock.calls.some(([id]) => id === 'a' || id === 'b')).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['drag', 'pinch', 'cancel', 'configure'])('%s during preview dismisses it and cannot become a release-tap', reason => {
    const h = press(); h.gesture.down(1, p, 'a'); h.advance(220);
    if (reason === 'drag') h.gesture.move(1, { x: 109, y: 200 });
    if (reason === 'pinch') { h.gesture.down(2, { x: 200, y: 200 }, 'b'); h.gesture.move(2, { x: 250, y: 200 }); }
    if (reason === 'cancel') h.gesture.cancel();
    if (reason === 'configure') h.gesture.configure(HOME_VIEW, space);
    expect(h.preview).toHaveBeenLastCalledWith(undefined); expect(h.gesture.up(1, p)).toBeUndefined(); expect(h.gesture.up(2, p)).toBeUndefined();
  });
  it('suppresses long empty/ambiguous presses without guessing an arrow', () => {
    const h = press(); h.gesture.down(1, p); h.advance(300); expect(h.gesture.up(1, p)).toBeUndefined();
    expect(h.preview.mock.calls.every(([id]) => id === undefined)).toBe(true);
    h.gesture.down(1, p, undefined, true); h.advance(100); expect(h.gesture.up(1, { x: 105, y: 200 })).toEqual(p);
  });
  it('supports an adjustable threshold and refuses preview outside ready phase', () => {
    vi.useFakeTimers(); const preview = vi.fn(); let ready = true;
    const gesture = new BoardGesture(HOME_VIEW, space, { preview, ready: () => ready, thresholdMs: 300 });
    gesture.down(1, p, 'a'); vi.advanceTimersByTime(220); expect(preview).not.toHaveBeenCalledWith('a');
    ready = false; vi.advanceTimersByTime(80); expect(preview).not.toHaveBeenCalledWith('a'); expect(gesture.up(1, p)).toBeUndefined();
  });
});

describe('source arc-length trail, lane truth and finite departure geometry', () => {
  const paths = [
    [{ x: 0, y: 0 }, { x: 4, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 3, y: 2 }],
    [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 4, y: 4 }],
  ];
  it.each(paths.map((points, i) => ({ points, i })))('reveals path $i strictly behind its tail in source order', ({ points }) => {
    const samples = sourceTrail(points), curve = curveFor(points);
    expect(samples[0]!.distance).toBe(0); expect(samples.at(-1)!.distance).toBe(curve.length);
    for (let tail = 0; tail <= curve.length + 1; tail += .07) {
      const visible = samples.filter(s => trailOpacity(s.distance, tail) > 0);
      for (const sample of visible) {
        expect(sample.distance + .16).toBeLessThan(tail + 1e-9);
        expect(sample.point).toEqual(pointAt(curve, sample.distance));
      }
      expect(visible).toEqual(samples.slice(0, visible.length));
      expect(samples.filter(s => s.distance >= tail).every(s => trailOpacity(s.distance, tail) === 0)).toBe(true);
    }
  });
  it('bounds huge source sampling and keeps the final point', () => {
    const samples = sourceTrail([{ x: 0, y: 0 }, { x: 12000, y: 0 }]);
    expect(samples).toHaveLength(1024); expect(samples.at(-1)!.distance).toBe(12000);
    expect(sourceTrail([{ x: 0, y: 0 }])).toEqual([]);
  });
  it('shows canonical first contact on a blocked lane without changing any state', () => {
    const state = createGameState(bentBlockedLevel, 'challenge'), before = JSON.stringify(state.level);
    const preview = lanePreview(state, 'bent')!;
    expect(preview.blockerId).toBe('lane-body'); expect(preview.contact).toEqual({ x: 6, y: 3 });
    expect(preview.lane[0]).toEqual({ x: 4, y: 3 }); expect(state).toMatchObject({ hearts: 3, moves: 0, phase: 'ready' });
    expect(JSON.stringify(state.level)).toBe(before); expect(lanePreview(state, 'absent')).toBeUndefined();
    expect(lanePreview({ ...state, phase: 'animating' }, 'bent')).toBeUndefined();
  });
  it.each([2, 3, 5, 7, 8, 10, 18, 24])('bounds interactive timing by measured distance for %s-cell bodies', cells => {
    for (const travel of [20, 120, 400, 1800]) {
      const duration = departureDuration(cells, travel, 20);
      expect(duration).toBeGreaterThanOrEqual(cells <= 7 ? 300 : 450);
      expect(duration).toBeLessThanOrEqual(cells <= 7 ? 550 : 800);
    }
    expect(departureDuration(cells, 400, 20)).toBeGreaterThanOrEqual(departureDuration(cells, 120, 20));
  });
  it('moves a three-bend body along original vertices and a straight ray, keeping its arc length', () => {
    const arrow = fixtureArrow('winding', 'right', [0, 0], [0, 1], [1, 1], [1, 2], [2, 2]);
    const extraction = extractionFor(arrow, p => ({ x: p.x * 30, y: p.y * 30 }), 390, 844, 20);
    for (const travel of [0, 12, 35, 65, 95, 120, 200, extraction.travel]) {
      const body = curveWindow(extraction.curve, travel, extraction.length);
      expect(curveFor(body).length).toBeCloseTo(extraction.length);
      expect(body[0]).toEqual(pointAt(extraction.curve, travel));
      expect(body.at(-1)!.y).toBe(60); expect(body.at(-1)!.x).toBeCloseTo(60 + travel);
    }
  });
  it('allows explicit QA timing bounds without changing the default profile or trajectories', () => {
    const original=JSON.stringify(INTERACTIVE_TIMING);
    expect(departureDuration(9,400,20,{...INTERACTIVE_TIMING,longMinMs:600,longMaxMs:700})).toBe(618);
    expect(departureDuration(2,40,20,{...INTERACTIVE_TIMING,shortMinMs:400,shortMaxMs:500})).toBe(400);
    expect(JSON.stringify(INTERACTIVE_TIMING)).toBe(original);
  });
});
