import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountGameBoard } from '../graphics/game-board';
import type { GameBoard } from '../graphics/game-board';
import { boardTransform } from '../graphics/viewport';
import { gameplayLayout } from '../graphics/mobile-layout';
import { curveFor, pointAt } from '../graphics/animation';
import { GameSession } from '../gameplay/session';
import { freshProgress, PROGRESS_KEY } from '../storage/progress';
import { getLevel } from '../game/levels';
import { getSafeArrowIds, buildOccupancy, firstBlocker } from '../game/rules';
import { analyzeDifficulty } from '../game/difficulty';
import type { GameMode, Level } from '../game/types';
import { memoryStorage } from './fixtures/storage';
import { bentBlockedLevel, fixtureArrow, fixtureLevel } from './fixtures/puzzles';
import denseA from './fixtures/dense-v2-r2-a-seed0.json';
import denseB from './fixtures/dense-v2-r2-b-seed0.json';
import { generateDenseLevel } from '../game/dense-v2/generator';

async function harness(level: Level = bentBlockedLevel, reduced = false, mode: GameMode = 'challenge', width = 390, height = 844) {
  vi.useFakeTimers(); let now = 0, frameId = 0;
  const frames = new Map<number, FrameRequestCallback>(), captures = new Set<number>();
  const calls: { kind: string; args: unknown[] }[] = [];
  const context = Object.fromEntries(['clearRect','save','restore','beginPath','moveTo','lineTo','quadraticCurveTo','stroke','fill','arc','rect','clip','closePath','setTransform'].map(kind => [kind, (...args: unknown[]) => calls.push({ kind, args })]));
  const canvas = Object.assign(new EventTarget(), { width: 0, height: 0, dataset: {} as Record<string,string>, getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }), focus: () => {},
    setPointerCapture: (id: number) => captures.add(id), hasPointerCapture: (id: number) => captures.has(id), releasePointerCapture: (id: number) => captures.delete(id) });
  Object.defineProperties(canvas, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
  const win = Object.assign(new EventTarget(), { devicePixelRatio: 2, requestAnimationFrame(fn: FrameRequestCallback) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id: number) { frames.delete(id); } });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc); vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => win.requestAnimationFrame(fn)); vi.stubGlobal('cancelAnimationFrame', (id: number) => win.cancelAnimationFrame(id));
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#24333a' })); vi.stubGlobal('matchMedia', () => new EventTarget());
  let resized = () => {}; vi.stubGlobal('ResizeObserver', class { constructor(fn: () => void) { resized = fn; } observe() {} disconnect() {} });
  const storage = memoryStorage(), writes = vi.spyOn(storage, 'setItem');
  const feedback = { launch: vi.fn(), complete: vi.fn(), blocked: vi.fn(), victory: vi.fn(), cancel: vi.fn() }, announce = vi.fn();
  let board: GameBoard, session: GameSession;
  const attempts = vi.fn((id: string) => {
    const move = session.attempt(id); if (!move || move.result.type === 'ignored') return;
    if (move.result.type === 'blocked') board.flash([id, move.result.blockerId]);
    else board.escape(id, () => { session.complete(move.token); if (session.current.state?.phase === 'won') board.celebrate(); });
  });
  const interrupt = () => { board.cancel(); session.interrupt(); };
  board = mountGameBoard(canvas as unknown as HTMLCanvasElement, attempts, () => session.interrupt(), () => reduced, announce, { safeRect: (w,h) => gameplayLayout(w,h).safe, feedback });
  const analysis = analyzeDifficulty(level); if (!analysis.ok) throw new Error('Invalid test fixture');
  session = new GameSession(freshProgress(), storage, snapshot => board.setState(snapshot.state), () => ({ ok: true, source: 'procedural', level, analysis, witness: analysis.solution.order }));
  await session.load(11, mode, false);
  const frame = (time: number) => { now = time; const callbacks = [...frames.values()]; frames.clear(); for (const fn of callbacks) fn(time); };
  frame(0); writes.mockClear(); feedback.cancel.mockClear();
  const event = (type: string, values: Record<string,unknown> = {}) => { const event = Object.assign(new Event(type, { cancelable: true }), values); canvas.dispatchEvent(event); return event; };
  const pointer = (type: string, point: {x:number;y:number}, id = 1) => event(type, { clientX: point.x, clientY: point.y, pointerId: id, button: 0, pointerType: 'touch' });
  const state = () => session.current.state!;
  const point = (id: string) => boardTransform({ width, height, columns: level.width, rows: level.height, safe: gameplayLayout(width,height).safe }).toCSS(state().level.arrows.find(a => a.id === id)!.cells[0]!);
  return { board, canvas, calls, frames, writes, storage, feedback, attempts, announce, session, state, point, event, pointer, frame, interrupt,
    advance(ms: number) { now += ms; vi.advanceTimersByTime(ms); },
    tap(id: string) { const p = point(id); pointer('pointerdown',p); pointer('pointerup',p); },
    resize() { width = 844; height = 390; resized(); frame(now); },
    blur() { win.dispatchEvent(new Event('blur')); }, pagehide() { win.dispatchEvent(new Event('pagehide')); },
    hide() { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); },
    outsidePointer() { win.dispatchEvent(new Event('pointerdown')); },
  };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('real engine + renderer + save + feedback integration', () => {
  it('quick tap keeps pending occupancy, then commits/saves/completes exactly once after visible travel', async () => {
    const result = getLevel(11); if (!result.ok) throw new Error(result.message);
    const h = await harness(result.level), id = getSafeArrowIds(h.state())[0]!;
    h.tap(id); expect(h.attempts).toHaveBeenCalledTimes(1); expect(h.state()).toMatchObject({ phase:'animating', hearts:3, moves:1 });
    expect(h.state().activeArrowIds.has(id)).toBe(true); expect(h.writes).not.toHaveBeenCalled();
    expect(h.feedback.launch).toHaveBeenCalledTimes(1); expect(h.feedback.launch.mock.calls[0]![0]).toBeGreaterThanOrEqual(300);
    h.frame(0); h.frame(150); expect(h.state().phase).toBe('animating');
    const stale = [...h.frames.values()][0]!; h.frame(800); stale(1000);
    expect(h.state().activeArrowIds.has(id)).toBe(false); expect(h.state().moves).toBe(1); expect(h.feedback.complete).toHaveBeenCalledTimes(1);
    expect(JSON.parse(h.storage.getItem(PROGRESS_KEY)!).run.history).toEqual([{ arrowId:id, outcome:'exiting', count:1 }]);
    h.board.dispose();
  });
  it.each(['challenge','zen'] as const)('a blocked tap has one attempt and exact %s penalties/audio', async mode => {
    const h = await harness(bentBlockedLevel, false, mode); h.tap('bent');
    expect(h.attempts).toHaveBeenCalledTimes(1); expect(h.state()).toMatchObject({ hearts: mode === 'challenge' ? 2 : 3, moves:1, mistakes:1, phase:'ready' });
    expect(h.feedback.blocked).toHaveBeenCalledTimes(1); expect(h.feedback.launch).not.toHaveBeenCalled(); expect(h.state().activeArrowIds.size).toBe(3); h.board.dispose();
  });
  it.each(['challenge','zen'] as const)('blocked hold/release in %s is a pure preview with no save or audio', async mode => {
    const h = await harness(bentBlockedLevel, false, mode), before = h.storage.getItem(PROGRESS_KEY), p = h.point('bent');
    h.pointer('pointerdown',p); h.advance(219); expect(h.canvas.dataset.preview).toBeUndefined();
    h.advance(1); expect(h.canvas.dataset.preview).toBe('bent'); expect(h.canvas.dataset.previewBlocker).toBe('lane-body');
    expect(JSON.parse(h.canvas.dataset.previewContact!)).toEqual({x:6,y:3});
    h.pointer('pointerup',p); const click = h.event('click'); h.advance(2000);
    expect(click.defaultPrevented).toBe(true); expect(h.canvas.dataset.preview).toBe('');
    expect(h.state()).toMatchObject({ hearts:3, moves:0, mistakes:0, phase:'ready' }); expect(h.attempts).not.toHaveBeenCalled();
    expect(h.writes).not.toHaveBeenCalled(); expect(h.storage.getItem(PROGRESS_KEY)).toBe(before);
    for (const method of ['launch','complete','blocked','victory'] as const) expect(h.feedback[method]).not.toHaveBeenCalled(); h.board.dispose();
  });
  const cancellations = ['pointercancel','lostpointercapture','blur','pagehide','hidden','pause','restart','switch','wheel','zoom','reset','resize','second pointer','margin second pointer','control second pointer','pan'] as const;
  it.each(cancellations.flatMap(reason => [100,300].map(heldMs => ({reason,heldMs}))))('$reason at $heldMs ms clears ownership/preview without a phantom move', async ({reason,heldMs}) => {
    const h = await harness(), p = h.point('bent'); h.pointer('pointerdown',p); h.advance(heldMs);
    switch (reason) {
      case 'pointercancel': case 'lostpointercapture': h.event(reason,{pointerId:1}); break;
      case 'blur': h.blur(); break; case 'pagehide': h.pagehide(); break; case 'hidden': h.hide(); break;
      case 'pause': h.interrupt(); break; case 'restart': h.session.restart(); break;
      case 'switch': await h.session.load(12, 'challenge', false); break;
      case 'wheel': h.event('wheel',{clientX:p.x,clientY:p.y,deltaY:-100}); break;
      case 'zoom': h.board.zoom(1.5); break; case 'reset': h.board.resetView(); break; case 'resize': h.resize(); break;
      case 'second pointer': h.pointer('pointerdown',{x:p.x+50,y:p.y},2); break;
      case 'margin second pointer': h.pointer('pointerdown',{x:10,y:30},2); break;
      case 'control second pointer': h.outsidePointer(); break;
      case 'pan': h.pointer('pointermove',{x:p.x+20,y:p.y}); break;
    }
    h.advance(1500); h.pointer('pointerup',p); h.pointer('pointerup',p,2); h.event('click');
    expect(h.canvas.dataset.preview ?? '').toBe(''); expect(h.attempts).not.toHaveBeenCalled(); expect(h.state()).toMatchObject({moves:0,hearts:3,phase:'ready'});
    expect(h.feedback.launch).not.toHaveBeenCalled(); expect(h.feedback.blocked).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); h.board.dispose();
  });
  it('keyboard P/Escape previews accessibly; Enter attempts once and ignores repeat', async () => {
    const h = await harness(); h.event('keydown',{key:'ArrowRight'}); h.event('keydown',{key:'p'});
    expect(h.canvas.dataset.preview).toBe('bent'); expect(h.announce).toHaveBeenLastCalledWith(expect.stringContaining('Blocked by arrow 3'));
    expect(h.announce).toHaveBeenLastCalledWith(expect.stringContaining('P or Escape dismisses'));
    expect(h.attempts).not.toHaveBeenCalled(); h.event('keydown',{key:'Escape'}); expect(h.canvas.dataset.preview).toBe('');
    h.event('keydown',{key:'p'}); h.event('keydown',{key:'Enter'}); h.event('keydown',{key:'Enter',repeat:true});
    expect(h.attempts).toHaveBeenCalledTimes(1); expect(h.state().hearts).toBe(2); h.board.dispose();
  });
  it('reveals ordered dots during a multi-bend departure and fades to zero finite idle work', async () => {
    const level=fixtureLevel([fixtureArrow('wind','right',[1,1],[1,2],[2,2],[2,3],[3,3],[4,3])],7,7);
    const h=await harness(level); h.tap('wind'); h.frame(0); expect(h.canvas.dataset.trailDots).toBe('0');
    h.frame(100); const early=Number(h.canvas.dataset.trailDots),tail=JSON.parse(h.canvas.dataset.movingTail!);
    expect(early).toBeGreaterThan(0);
    const expected=pointAt(curveFor(level.arrows[0]!.cells),Number(h.canvas.dataset.tailDistance)),origin=h.point('wind'),cell=Number(h.canvas.dataset.cellSize);
    expect(tail.x).toBeCloseTo(origin.x+(expected.x-1)*cell,2);expect(tail.y).toBeCloseTo(origin.y+(expected.y-1)*cell,2);
    h.frame(200); expect(Number(h.canvas.dataset.trailDots)).toBeGreaterThan(early); expect(h.state().phase).toBe('animating');
    h.frame(800); expect(h.state().phase).toBe('won'); expect(Number(h.canvas.dataset.trailDots)).toBeGreaterThan(0);
    h.frame(800); h.frame(1500); expect(h.canvas.dataset.trailDots).toBe('0'); expect(h.frames.size).toBe(0);
    const paints=h.canvas.dataset.paintCount;h.frame(2000);expect(h.canvas.dataset.paintCount).toBe(paints);h.board.dispose();
  });
  it.each(['pause','restart','switch','blur','dispose'] as const)('%s during travel cancels dots/audio/RAF and stale completion cannot save/remove', async reason => {
    const h=await harness(),id=getSafeArrowIds(h.state())[0]!,before=h.storage.getItem(PROGRESS_KEY);h.tap(id);h.frame(0);h.frame(120);
    const stale=[...h.frames.values()];
    if(reason==='pause')h.interrupt();if(reason==='restart'){h.board.cancel();h.session.restart();}
    if(reason==='switch')await h.session.load(12,'challenge',false);if(reason==='blur')h.blur();if(reason==='dispose')h.board.dispose();
    for(const callback of stale){callback(1000);callback(2000);}
    expect(h.feedback.complete).not.toHaveBeenCalled();expect(h.feedback.cancel).toHaveBeenCalled();expect(h.canvas.dataset.trailDots).toBe('0');expect(h.frames.size).toBe(0);
    if(reason==='pause'||reason==='blur'){expect(h.state()).toMatchObject({moves:0,phase:'ready',hearts:3});expect(h.storage.getItem(PROGRESS_KEY)).toBe(before);expect(h.writes).not.toHaveBeenCalled();}
    h.board.dispose();
  });
  it('reduced-motion start/midflight settle completes exactly once without ghost dots', async () => {
    const h=await harness(undefined,true),id=getSafeArrowIds(h.state())[0]!;h.tap(id);h.board.settle();h.frame(1500);
    expect(h.feedback.complete).toHaveBeenCalledTimes(1);expect(h.state().activeArrowIds.has(id)).toBe(false);expect(h.canvas.dataset.trailDots).toBe('0');expect(h.frames.size).toBe(0);h.board.dispose();
    const full=await harness(),safe=getSafeArrowIds(full.state())[0]!;full.tap(safe);full.frame(0);full.frame(100);const stale=[...full.frames.values()];full.board.settle();for(const fn of stale)fn(2000);
    expect(full.feedback.complete).toHaveBeenCalledTimes(1);expect(full.canvas.dataset.trailDots).toBe('0');expect(full.frames.size).toBe(0);full.board.dispose();
  });
  it.each([[320,568],[390,844],[844,390]])('real 44/66/85-path boards retain hold/collision/extraction semantics at %s×%s', async (width,height) => {
    const upper=generateDenseLevel(0,{family:'B',arrowCount:85});if(!upper.ok)throw new Error(upper.message);
    for(const level of [denseA.level,denseB.level,upper.level] as Level[]){
      const h=await harness(level,false,'challenge',width,height),geometry=JSON.stringify(h.state().level),safe=getSafeArrowIds(h.state())[0]!;
      const blocked=h.state().level.arrows.find(a=>firstBlocker(a,buildOccupancy(h.state().level),h.state().level)!==null)!;
      const p=h.point(blocked.id);h.pointer('pointerdown',p);h.advance(250);expect(h.canvas.dataset.preview).toBe(blocked.id);h.pointer('pointerup',p);
      expect(h.attempts).not.toHaveBeenCalled();expect(h.state().hearts).toBe(3);h.tap(safe);expect(h.state().phase).toBe('animating');
      h.frame(0);h.frame(1000);expect(h.state().activeArrowIds.size).toBe(level.arrows.length-1);expect(h.state().hearts).toBe(3);expect(JSON.stringify(h.state().level)).toBe(geometry);h.board.dispose();
    }
  });
  it('does not select fading trail dots as paths', async () => {
    const level=fixtureLevel([fixtureArrow('only','right',[1,1],[2,1]),fixtureArrow('other','down',[4,3],[4,4])],6,6),h=await harness(level),point=h.point('only');
    h.tap('only');h.frame(0);h.frame(800);expect(Number(h.canvas.dataset.trailDots)).toBeGreaterThan(0);h.attempts.mockClear();
    h.pointer('pointerdown',point);h.pointer('pointerup',point);expect(h.attempts).not.toHaveBeenCalled();expect(h.state().moves).toBe(1);h.board.dispose();
  });
  it('ambiguous contacts never preview a guessed neighbor or charge a heart, including after holding', async () => {
    const level=fixtureLevel([fixtureArrow('a','down',[5,4],[5,5],[5,6]),fixtureArrow('b','down',[6,4],[6,5],[6,6])],13,13),h=await harness(level);
    const p=boardTransform({width:390,height:844,columns:13,rows:13,safe:gameplayLayout(390,844).safe}).toCSS({x:5.5,y:5});
    h.pointer('pointerdown',p);h.advance(300);expect(h.canvas.dataset.preview??'').toBe('');h.pointer('pointerup',p);h.event('click');
    expect(h.attempts).not.toHaveBeenCalled();expect(h.writes).not.toHaveBeenCalled();
    h.pointer('pointerdown',p);h.pointer('pointerup',p);expect(h.canvas.dataset.zoom).toBe('1.500');expect(h.state()).toMatchObject({hearts:3,moves:0});h.board.dispose();
  });
  it('hold release restores selection access; terminal and animating phases cannot create new holds or taps', async () => {
    const level=fixtureLevel([fixtureArrow('a','right',[1,1],[2,1])],4,4),h=await harness(level),p=h.point('a');
    h.pointer('pointerdown',p);h.advance(300);h.pointer('pointerup',p);h.tap('a');expect(h.state().phase).toBe('animating');
    h.pointer('pointerdown',p);h.advance(300);h.pointer('pointerup',p);expect(h.canvas.dataset.preview??'').toBe('');expect(h.attempts).toHaveBeenCalledTimes(1);
    h.frame(0);h.frame(1000);expect(h.state().phase).toBe('won');h.pointer('pointerdown',p);h.advance(300);h.pointer('pointerup',p);
    expect(h.attempts).toHaveBeenCalledTimes(1);expect(h.feedback.victory).toHaveBeenCalledTimes(1);h.board.dispose();
  });
  it('canvas context menus are suppressed without affecting ordinary menu targets', async () => {
    const h=await harness();expect(h.event('contextmenu').defaultPrevented).toBe(true);
    const other=new EventTarget(),event=new Event('contextmenu',{cancelable:true});other.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);h.board.dispose();
  });
});
