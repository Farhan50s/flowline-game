import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountGameBoard } from '../graphics/game-board';
import { boardTransform } from '../graphics/viewport';
import { getLevel } from '../game/levels';
import { attemptMove, createGameState } from '../game/state';

/** Small browser ports, not a replacement for hands-on browser checks. Native receiver checks are intentional. */
function boardHarness(reduced = false, number = 4) {
  const calls: { kind: string; values: unknown[] }[] = [];
  const ctx = Object.fromEntries(['clearRect', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'fill', 'arc', 'rect', 'clip', 'closePath', 'setTransform']
    .map(kind => [kind, (...values: unknown[]) => calls.push({ kind, values })]));
  let width = 300, height = 400, frameId = 0;
  const frames = new Map<number, FrameRequestCallback>(), captured = new Set<number>();
  const canvas = Object.assign(new EventTarget(), {
    width: 0, height: 0, dataset: {} as Record<string, string>,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 10, top: 20, width, height }),
    focus: vi.fn(), setPointerCapture: (id: number) => captured.add(id), hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  });
  Object.defineProperties(canvas, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
  const win = Object.assign(new EventTarget(), {
    devicePixelRatio: 2,
    requestAnimationFrame(this: unknown, fn: FrameRequestCallback) { if (this !== win) throw new TypeError('Illegal invocation'); frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(this: unknown, id: number) { if (this !== win) throw new TypeError('Illegal invocation'); frames.delete(id); },
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => win.requestAnimationFrame(fn));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => win.cancelAnimationFrame(id));
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#202E36' }));
  const densities: EventTarget[] = [];
  vi.stubGlobal('matchMedia', () => { const query = new EventTarget(); densities.push(query); return query; });
  const disconnect = vi.fn(); let observedResize: () => void = () => {};
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { observedResize = callback; } observe() {} disconnect = disconnect; });
  const attempts = vi.fn(), interruptions = vi.fn(), announcements = vi.fn();
  const board = mountGameBoard(canvas as unknown as HTMLCanvasElement, attempts, interruptions, () => reduced, announcements);
  const result = getLevel(number); if (!result.ok) throw new Error(result.message);
  const state = createGameState(result.level, 'challenge'); board.setState(state);
  const step = (time: number) => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); };
  // Drain initial resize before starting a gesture/escape.
  step(0);
  const event = (type: string, values: Record<string, unknown> = {}) => { const event = Object.assign(new Event(type, { cancelable: true }), values); canvas.dispatchEvent(event); return event; };
  const press = (id: number, x: number, y: number, type: string) => event(type, { pointerId: id, button: 0, clientX: x + 10, clientY: y + 20 });
  return { board, canvas, calls, frames, step, event, press, attempts, interruptions, announcements, state, disconnect,
    resize(w: number, h: number) { width = w; height = h; observedResize(); step(0); },
    densityChange() { win.devicePixelRatio = 3; densities.at(-1)!.dispatchEvent(new Event('change')); step(0); } };
}
afterEach(() => vi.unstubAllGlobals());
describe('Canvas / pointer adapter with lifecycle ports', () => {
  it('uses DPR backing pixels, redraws on resize/density and has no idle frame loop', () => {
    const h = boardHarness(); expect(h.canvas.width).toBe(600); expect(h.canvas.height).toBe(800); expect(h.frames.size).toBe(0);
    h.resize(200, 320); expect(h.canvas.width).toBe(400); expect(h.canvas.height).toBe(640);
    h.densityChange(); expect(h.canvas.width).toBe(600); expect(h.frames.size).toBe(0);
    expect(h.calls.some(c => c.kind === 'clip')).toBe(true); h.board.dispose(); expect(h.disconnect).toHaveBeenCalledTimes(1);
  });
  it.each([1, 4, 10, 11, 81])('draws every active arrow from real level %s across phone/wide sizes', number => {
    const h = boardHarness(false, number);
    for (const [width, height] of [[284, 248], [342, 524], [382, 560], [350, 342], [640, 530]]) {
      h.calls.length = 0; h.resize(width!, height!);
      expect(h.calls.filter(c => c.kind === 'stroke')).toHaveLength(h.state.level.arrows.length);
      expect(h.frames.size).toBe(0); expect(Number(h.canvas.dataset.maxPaintMs)).toBeGreaterThanOrEqual(0);
      const count = h.canvas.dataset.paintCount; h.step(500); expect(h.canvas.dataset.paintCount).toBe(count);
    }
    h.board.dispose();
  });
  it('mouse/touch pointer taps identify real segments while gaps and drags produce no attempt', () => {
    const h = boardHarness(); const t = boardTransform({ width: 300, height: 400, columns: 7, rows: 7 });
    const point = t.toCSS({ x: 1, y: 3.5 }); h.press(1, point.x, point.y, 'pointerdown'); h.press(1, point.x, point.y, 'pointerup');
    expect(h.attempts).toHaveBeenLastCalledWith(h.state.level.arrows[0]!.id);
    h.attempts.mockClear(); const gap = t.toCSS({ x: 2, y: 3 }); h.press(2, gap.x, gap.y, 'pointerdown'); h.press(2, gap.x, gap.y, 'pointerup');
    h.press(3, point.x, point.y, 'pointerdown'); h.press(3, point.x + 40, point.y, 'pointermove'); h.press(3, point.x, point.y, 'pointerup');
    expect(h.attempts).not.toHaveBeenCalled(); h.board.dispose();
  });
  it('pointercancel and lost capture never extract a path', () => {
    const h = boardHarness(), p = boardTransform({ width: 300, height: 400, columns: 7, rows: 7 }).toCSS({ x: 5, y: 2.5 });
    for (const type of ['pointercancel', 'lostpointercapture']) { h.press(1, p.x, p.y, 'pointerdown'); h.event(type, { pointerId: 1 }); h.press(1, p.x, p.y, 'pointerup'); }
    expect(h.attempts).not.toHaveBeenCalled(); h.board.dispose();
  });
  it('pinch pointers and wheel zoom prevent scroll and preserve accurate transformed hit testing', () => {
    const h = boardHarness(); h.press(1, 100, 200, 'pointerdown'); h.press(2, 200, 200, 'pointerdown');
    h.press(2, 300, 200, 'pointermove'); h.press(1, 100, 200, 'pointerup'); h.press(2, 300, 200, 'pointerup');
    expect(h.attempts).not.toHaveBeenCalled(); h.board.resetView();
    const wheel = h.event('wheel', { clientX: 160, clientY: 220, deltaY: -100 }); expect(wheel.defaultPrevented).toBe(true);
    const t = boardTransform({ width: 300, height: 400, columns: 7, rows: 7 }, { zoom: Math.exp(.3), x: 0, y: 0 });
    const p = t.toCSS({ x: 5, y: 2.5 }); h.press(3, p.x, p.y, 'pointerdown'); h.press(3, p.x, p.y, 'pointerup');
    expect(h.attempts).toHaveBeenLastCalledWith(h.state.level.arrows[1]!.id); h.board.dispose();
  });
  it('keyboard selection announces direction and Enter calls an actual attempt', () => {
    const h = boardHarness(); h.event('keydown', { key: 'ArrowRight' }); expect(h.announcements).toHaveBeenLastCalledWith(expect.stringContaining('Arrow 1'));
    h.event('keydown', { key: 'Enter' }); expect(h.attempts).toHaveBeenCalledWith(h.state.level.arrows[0]!.id); h.board.dispose();
  });
  it('expected capture release after a pinch preserves the remaining finger pan and suppresses its tap', () => {
    const h = boardHarness();
    h.press(1, 100, 200, 'pointerdown'); h.press(2, 200, 200, 'pointerdown'); h.press(2, 300, 200, 'pointermove');
    h.press(1, 100, 200, 'pointerup'); h.event('lostpointercapture', { pointerId: 1 });
    h.press(2, 320, 200, 'pointermove'); h.press(2, 320, 200, 'pointerup'); h.event('lostpointercapture', { pointerId: 2 });
    expect(h.attempts).not.toHaveBeenCalled();
    const t = boardTransform({ width: 300, height: 400, columns: 7, rows: 7 }, { zoom: 2, x: 70, y: 0 });
    const point = t.toCSS({ x: 1, y: 3.5 }); h.press(3, point.x, point.y, 'pointerdown'); h.press(3, point.x, point.y, 'pointerup');
    expect(h.attempts).toHaveBeenLastCalledWith(h.state.level.arrows[0]!.id); h.board.dispose();
  });
  it('pending arrows remain rendered, input is gated and extraction completes exactly once', () => {
    const h = boardHarness(), gate = h.state.level.arrows[1]!.id;
    h.board.setState(attemptMove(h.state, gate).state); const complete = vi.fn();
    h.board.escape(gate, complete); const stale = [...h.frames.values()][0]!;
    h.event('keydown', { key: 'ArrowRight' }); h.event('keydown', { key: 'Enter' }); expect(h.attempts).not.toHaveBeenCalled();
    h.step(100); h.step(250); expect(complete).not.toHaveBeenCalled(); h.step(1000); stale(1200);
    expect(complete).toHaveBeenCalledTimes(1); expect(h.frames.size).toBe(0); expect(h.state.activeArrowIds.size).toBe(3); h.board.dispose();
  });
  it.each(['cancel', 'dispose', 'resize'])('%s invalidates stale browser callbacks', action => {
    const h = boardHarness(), gate = h.state.level.arrows[1]!.id; h.board.setState(attemptMove(h.state, gate).state);
    const complete = vi.fn(); h.board.escape(gate, complete); const stale = [...h.frames.values()][0]!;
    if (action === 'resize') { h.resize(250, 320); expect(h.interruptions).toHaveBeenCalledTimes(1); }
    else if (action === 'dispose') h.board.dispose(); else h.board.cancel();
    stale(0); stale(1000); expect(complete).not.toHaveBeenCalled(); h.board.dispose();
  });
  it('reduced motion settles immediately and does not leave a recurring frame', () => {
    const h = boardHarness(true), gate = h.state.level.arrows[1]!.id; h.board.setState(attemptMove(h.state, gate).state);
    const complete = vi.fn(); h.board.escape(gate, complete); h.board.settle(); expect(complete).toHaveBeenCalledTimes(1); expect(h.frames.size).toBe(0); h.board.dispose();
  });
  it('disposal removes input listeners as well as observers/animation callbacks', () => {
    const h = boardHarness(); h.board.dispose(); const before = h.calls.length;
    h.event('keydown', { key: 'ArrowRight' }); h.press(1, 100, 100, 'pointerdown'); h.press(1, 100, 100, 'pointerup');
    expect(h.attempts).not.toHaveBeenCalled(); expect(h.calls).toHaveLength(before); expect(h.frames.size).toBe(0);
  });
});
