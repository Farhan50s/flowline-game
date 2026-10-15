import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountGameBoard } from '../graphics/game-board';
import type { GameBoard } from '../graphics/game-board';
import { gameplayLayout } from '../graphics/mobile-layout';
import { boardTransform, HOME_VIEW, zoomAt } from '../graphics/viewport';
import { getLevel } from '../game/levels';
import { attemptMove, completeEscape, createGameState } from '../game/state';
import type { Level } from '../game/types';
import { fixtureArrow, fixtureLevel } from './fixtures/puzzles';

function harness(level?: Level, reduced = false) {
  const result=getLevel(81);if(!result.ok)throw new Error(result.message);
  let state=createGameState(level??result.level,'challenge'),committed=state;
  let width=390,height=844,id=0;
  const frames=new Map<number,FrameRequestCallback>(),captures=new Set<number>();
  const calls:{kind:string;args:unknown[]}[]=[];
  const context=Object.fromEntries(['clearRect','save','restore','beginPath','moveTo','lineTo','quadraticCurveTo','stroke','fill','arc','rect','clip','closePath','setTransform'].map(kind=>[kind,(...args:unknown[])=>calls.push({kind,args})]));
  const canvas=Object.assign(new EventTarget(),{width:0,height:0,dataset:{} as Record<string,string>,getContext:()=>context,
    getBoundingClientRect:()=>({left:0,top:0,width,height}),focus:()=>{},setPointerCapture:(id:number)=>captures.add(id),hasPointerCapture:(id:number)=>captures.has(id),releasePointerCapture:(id:number)=>captures.delete(id)});
  Object.defineProperties(canvas,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
  const win=Object.assign(new EventTarget(),{devicePixelRatio:3,requestAnimationFrame(fn:FrameRequestCallback){frames.set(++id,fn);return id;},cancelAnimationFrame(id:number){frames.delete(id);}});
  vi.stubGlobal('window',win);vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>win.requestAnimationFrame(fn));vi.stubGlobal('cancelAnimationFrame',(id:number)=>win.cancelAnimationFrame(id));
  vi.stubGlobal('matchMedia',()=>new EventTarget());vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:()=> '#24333A'}));
  let resized=()=>{};const disconnected=vi.fn();vi.stubGlobal('ResizeObserver',class{constructor(fn:()=>void){resized=fn;}observe(){}disconnect=disconnected;});
  let board:GameBoard;
  const attempts=vi.fn((id:string)=>{const result=attemptMove(state,id);state=result.state;if(result.type==='blocked')committed=state;board.setState(state);});
  const interrupted=vi.fn(()=>{state=committed;board.setState(state);});const announcements=vi.fn();
  board=mountGameBoard(canvas as unknown as HTMLCanvasElement,attempts,interrupted,()=>reduced,announcements,{safeRect:(width,height)=>gameplayLayout(width,height).safe});
  const step=(time:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
  board.setState(state);step(0);
  const event=(type:string,values:Record<string,unknown>={})=>{const event=Object.assign(new Event(type,{cancelable:true}),values);canvas.dispatchEvent(event);return event;};
  const pointer=(type:string,x:number,y:number,pointerId=1)=>event(type,{clientX:x,clientY:y,pointerId,pointerType:'touch',button:0});
  const tap=(x:number,y:number)=>{pointer('pointerdown',x,y);pointer('pointerup',x,y);};
  return {board,canvas,frames,calls,attempts,announcements,interrupted,disconnected,step,event,pointer,tap,
    get state(){return state;},get space(){return{width,height,columns:state.level.width,rows:state.level.height,safe:gameplayLayout(width,height).safe};},
    resize(w:number,h:number){width=w;height=h;resized();step(0);},
    win(){const id=state.pendingArrowId;if(!id)throw new Error('No pending path');state=completeEscape(state);committed=state;board.setState(state);},
  };
}
afterEach(()=>vi.unstubAllGlobals());
describe('full-screen Canvas integration',()=>{
  it('uses the full CSS surface/DPR backing while fitting and clipping to the safe zone',()=>{
    const h=harness();expect(h.canvas.width).toBe(1170);expect(h.canvas.height).toBe(2532);
    expect(JSON.parse(h.canvas.dataset.safeRect!)).toEqual({x:16,y:72,width:358,height:676});
    expect(h.calls.some(c=>c.kind==='rect'&&JSON.stringify(c.args)==='[16,72,358,676]')).toBe(true);
    // Grid dots are gone: idle expert rendering contains no per-cell arc calls.
    expect(h.calls.filter(c=>c.kind==='arc')).toHaveLength(0);expect(h.frames.size).toBe(0);h.board.dispose();
  });
  it('taps in HUD and floating-control regions never reach the engine',()=>{
    const h=harness();for(const p of [{x:50,y:30},{x:195,y:30},{x:150,y:800},{x:230,y:800}])h.tap(p.x,p.y);
    expect(h.attempts).not.toHaveBeenCalled();expect(h.state.hearts).toBe(3);expect(h.state.moves).toBe(0);h.board.dispose();
  });
  it('a realistic ambiguous finger tap magnifies instead of attempting, then precise retap uses the new transform',()=>{
    const level=fixtureLevel([fixtureArrow('a','down',[5,4],[5,5],[5,6]),fixtureArrow('b','down',[6,4],[6,5],[6,6])],13,13);
    const h=harness(level),t=boardTransform(h.space),point=t.toCSS({x:5.5,y:5});h.tap(point.x,point.y);
    expect(h.attempts).not.toHaveBeenCalled();expect(h.state).toMatchObject({hearts:3,moves:0});expect(h.canvas.dataset.zoom).toBe('1.500');
    expect(h.announcements).toHaveBeenLastCalledWith(expect.stringContaining('No attempt was made'));
    const zoomed=boardTransform(h.space,zoomAt(HOME_VIEW,1.5,point,h.space)),contact=zoomed.toCSS({x:5,y:5});h.tap(contact.x,contact.y);
    expect(h.attempts).toHaveBeenLastCalledWith('a');expect(h.state).toMatchObject({phase:'animating',moves:1,hearts:3});h.board.dispose();
  });
  it.each([[320,568],[844,390]])('resizing to %s × %s preserves exact fit and input, with no idle frames', (width,height)=>{
    const h=harness();h.resize(width!,height!);expect(JSON.parse(h.canvas.dataset.safeRect!)).toEqual(gameplayLayout(width!,height!).safe);
    const arrow=h.state.level.arrows[0]!,point=boardTransform(h.space).toCSS(arrow.cells[0]!);h.tap(point.x,point.y);
    expect(h.attempts).toHaveBeenLastCalledWith(arrow.id);expect(h.frames.size).toBe(0);h.board.dispose();
  });
  it('orientation interruption invalidates queued extraction completion and retains frozen geometry',()=>{
    const level=fixtureLevel([fixtureArrow('a','right',[1,3],[1,2],[2,2],[3,2])],5,5),h=harness(level);
    const geometry=JSON.stringify(h.state.level),point=boardTransform(h.space).toCSS({x:1,y:2.5});h.tap(point.x,point.y);
    const complete=vi.fn();h.board.escape('a',complete);const stale=[...h.frames.values()][0]!;
    h.step(0);h.step(100);h.resize(844,390);stale(1000);
    expect(complete).not.toHaveBeenCalled();expect(h.interrupted).toHaveBeenCalledTimes(1);expect(h.state).toMatchObject({phase:'ready',moves:0});
    expect(JSON.stringify(h.state.level)).toBe(geometry);h.board.dispose();
  });
  it('original victory particles stop after a finite bloom and disposal cancels stale frames',()=>{
    const level=fixtureLevel([fixtureArrow('a','right',[1,1],[2,1])],4,4),h=harness(level);
    const p=boardTransform(h.space).toCSS({x:1.5,y:1});h.tap(p.x,p.y);h.win();h.board.celebrate();h.step(0);h.step(325);
    expect(h.calls.some(c=>c.kind==='arc')).toBe(true);h.step(650);expect(h.frames.size).toBe(0);
    h.board.celebrate();const stale=[...h.frames.values()][0]!;h.board.dispose();const length=h.calls.length;stale(900);expect(h.calls).toHaveLength(length);expect(h.frames.size).toBe(0);
  });
  it('reduced motion commits extraction once and skips celebratory movement',()=>{
    const level=fixtureLevel([fixtureArrow('a','right',[1,1],[2,1])],4,4),h=harness(level,true);
    const p=boardTransform(h.space).toCSS({x:1.5,y:1});h.tap(p.x,p.y);const complete=vi.fn(()=>h.win());h.board.escape('a',complete);h.board.settle();
    expect(complete).toHaveBeenCalledTimes(1);h.board.celebrate();expect(h.frames.size).toBe(0);h.board.dispose();
  });
});
