import { describe, expect, it, vi } from 'vitest';
import { gameplayLayout, containsPoint, lineStyle } from '../graphics/mobile-layout';
import { boardTransform, boundView, HOME_VIEW, zoomAt } from '../graphics/viewport';
import { clippedSegment, touchTarget } from '../input/hit';
import { celebrationParticles } from '../graphics/celebration';
import { GameSession } from '../gameplay/session';
import { getLevel } from '../game/levels';
import { getSafeArrowIds } from '../game/rules';
import { freshProgress, PROGRESS_KEY } from '../storage/progress';
import { memoryStorage } from './fixtures/storage';
import type { ArrowPath } from '../game/types';

const sizes = [[320,568], [360,800], [390,844], [430,932], [844,390], [1024,768]] as const;
const insets = [{ top:0,right:0,bottom:0,left:0 }, { top:44,right:0,bottom:34,left:0 }];
const cases = sizes.flatMap(([width,height]) => insets.map(insets => ({width,height,insets})));
describe('full-viewport gameplay safe areas', () => {
  it.each(cases)('$width × $height with $insets keeps overlays and fit inside usable space', ({width,height,insets}) => {
    const layout = gameplayLayout(width,height,insets);
    for (const rect of [layout.safe,layout.hud,layout.controls]) {
      expect(rect.x).toBeGreaterThanOrEqual(insets.left); expect(rect.y).toBeGreaterThanOrEqual(insets.top);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width-insets.right);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height-insets.bottom);
    }
    const s = layout.safe, c = layout.controls, h = layout.hud;
    const overlaps = (a: typeof s,b: typeof s) => a.x < b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
    expect(overlaps(s,c)).toBe(false); expect(overlaps(s,h)).toBe(false);
    expect(Math.min(c.width,c.height)).toBeGreaterThanOrEqual(56);
    expect(h.height).toBeGreaterThanOrEqual(48);
  });
  it('meets the portrait interactive-region benchmark, including Android-like insets', () => {
    for (const value of insets) {
      const layout = gameplayLayout(390,844,value);
      expect(layout.safe.height/(844-value.top-value.bottom)).toBeGreaterThanOrEqual(.75);
    }
  });
  it.each([0,-1,NaN,Infinity])('rejects invalid viewport size %s', value => { expect(()=>gameplayLayout(value,844)).toThrow(RangeError); });
  it('normalizes invalid inset values and handles landscape cutouts on both sides', () => {
    expect(gameplayLayout(390,844,{top:NaN,right:-10,bottom:Infinity,left:-1})).toEqual(gameplayLayout(390,844));
    const layout=gameplayLayout(844,390,{top:0,right:44,bottom:21,left:44});
    expect(layout.landscape).toBe(true);expect(layout.safe.x).toBe(156);expect(layout.safe.y+layout.safe.height).toBeLessThanOrEqual(369);
  });
  it.each([11,41,81])('real level %s uses at least 85%% of safe width with equal world-axis scale', number => {
    const result=getLevel(number);if(!result.ok)throw new Error(result.message);
    const safe=gameplayLayout(390,844).safe;
    const space={width:390,height:844,columns:result.level.width,rows:result.level.height,safe};
    const transform=boardTransform(space);
    const points=result.level.arrows.flatMap(a=>a.cells.map(transform.toCSS));
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
    expect((maxX-minX)/safe.width).toBeGreaterThanOrEqual(.85);
    const style=lineStyle(transform.cell);
    for(const point of points){expect(point.x-style.head*1.3).toBeGreaterThan(safe.x);expect(point.x+style.head*1.3).toBeLessThan(safe.x+safe.width);expect(point.y-style.head*1.3).toBeGreaterThan(safe.y);expect(point.y+style.head*1.3).toBeLessThan(safe.y+safe.height);}
    expect(transform.toCSS({x:1,y:0}).x-transform.toCSS({x:0,y:0}).x).toBeCloseTo(transform.toCSS({x:0,y:1}).y-transform.toCSS({x:0,y:0}).y);
    expect(style.stroke).toBeGreaterThanOrEqual(1.8);expect(style.stroke).toBeLessThanOrEqual(3.1);
  });
  it.each(sizes)('translated safe transforms invert accurately after resize to %s × %s', (width,height) => {
    const safe=gameplayLayout(width,height,{top:24,left:0,right:0,bottom:16}).safe;
    const space={width,height,columns:13,rows:13,safe};
    for(const zoom of [1,1.5,2.25,4]){
      const view=boundView({zoom,x:67,y:-91},space),t=boardTransform(space,view),point={x:3.14,y:8.75};
      const roundTrip=t.toWorld(t.toCSS(point));expect(roundTrip.x).toBeCloseTo(point.x,10);expect(roundTrip.y).toBeCloseTo(point.y,10);
      expect(Math.abs(view.x)).toBeLessThanOrEqual(safe.width*(zoom-1)/2);expect(Math.abs(view.y)).toBeLessThanOrEqual(safe.height*(zoom-1)/2);
    }
  });
  it('zoom anchors use the translated safe center, not the full-canvas center', () => {
    const safe=gameplayLayout(844,390).safe,space={width:844,height:390,columns:13,rows:13,safe};
    const anchor={x:safe.x+safe.width*.55,y:safe.y+safe.height*.6};
    const before=boardTransform(space).toWorld(anchor),after=boardTransform(space,zoomAt(HOME_VIEW,2,anchor,space)).toWorld(anchor);
    expect(after.x).toBeCloseTo(before.x,10);expect(after.y).toBeCloseTo(before.y,10);
    expect(containsPoint(safe,{x:50,y:30})).toBe(false);expect(containsPoint(safe,anchor)).toBe(true);
  });
});

const paths: readonly ArrowPath[]=[{id:'a',direction:'right',cells:[{x:0,y:0},{x:80,y:0}]},{id:'b',direction:'right',cells:[{x:0,y:28},{x:80,y:28}]}];
describe('finger-sized targeting without accidental penalties',()=>{
  it('identifies a clear contact and rejects an empty miss',()=>{
    expect(touchTarget({x:30,y:1},paths,new Set(['a','b']),p=>p)).toEqual({type:'selected',id:'a'});
    expect(touchTarget({x:30,y:70},paths,new Set(['a','b']),p=>p)).toEqual({type:'miss'});
  });
  it('does not select either path on a realistic 44px finger target between lines',()=>{
    expect(touchTarget({x:30,y:14},paths,new Set(['a','b']),p=>p)).toEqual({type:'ambiguous',ids:['a','b']});
    expect(touchTarget({x:30,y:11},paths,new Set(['a','b']),p=>p).type).toBe('ambiguous');
    expect(touchTarget({x:30,y:14},paths,new Set(['a']),p=>p)).toEqual({type:'selected',id:'a'});
  });
  it('does not hit invisible paths just outside the clipped safe rectangle',()=>{
    const clip={x:0,y:5,width:80,height:40};
    expect(touchTarget({x:30,y:7},paths,new Set(['a']),p=>p,22,clip)).toEqual({type:'miss'});
    expect(clippedSegment({x:-20,y:10},{x:100,y:10},clip)).toEqual([{x:0,y:10},{x:80,y:10}]);
    expect(clippedSegment({x:10,y:-20},{x:10,y:100},clip)).toEqual([{x:10,y:5},{x:10,y:45}]);
  });
  it('has the same hit result after safe-origin translation and zoom',()=>{
    const arrow:ArrowPath={id:'bend',direction:'right',cells:[{x:1,y:3},{x:1,y:2},{x:2,y:2}]};
    const safe=gameplayLayout(390,844).safe,space={width:390,height:844,columns:7,rows:7,safe};
    const t=boardTransform(space,{zoom:2,x:80,y:0});
    expect(touchTarget(t.toCSS({x:1,y:2.5}),[arrow],new Set(['bend']),t.toCSS,22,safe)).toEqual({type:'selected',id:'bend'});
  });
});

describe('practice isolation and pause commit boundaries',()=>{
  it.each([11,41,81])('practice level %s cannot write or unlock the stored campaign',async number=>{
    const storage=memoryStorage();storage.setItem(PROGRESS_KEY,'original campaign bytes');
    const write=vi.spyOn(storage,'setItem');
    const session=new GameSession(freshProgress(),storage,()=>{},getLevel,'',true);
    await session.load(number,'zen',false);
    while(session.current.state?.phase==='ready'){
      const result=session.attempt(getSafeArrowIds(session.current.state)[0]!)!;session.complete(result.token);
    }
    expect(session.current.state?.phase).toBe('won');expect(session.current.progress.highestUnlocked).toBe(1);
    expect(write).not.toHaveBeenCalled();expect(storage.getItem(PROGRESS_KEY)).toBe('original campaign bytes');
    await session.next();expect(session.current.number).toBe(number+1);expect(write).not.toHaveBeenCalled();
  });
  it('Pause interrupts an uncommitted escape while preserving earlier penalties and reload restoration',async()=>{
    const storage=memoryStorage(),session=new GameSession({...freshProgress(),highestUnlocked:2},storage,()=>{});
    await session.load(2);const [lead,gate]=session.current.state!.level.arrows;
    session.attempt(lead!.id);const pending=session.attempt(gate!.id)!;const saved=storage.getItem(PROGRESS_KEY);
    session.interrupt();session.complete(pending.token);
    expect(session.current.state).toMatchObject({phase:'ready',hearts:2,moves:1,mistakes:1});
    expect(storage.getItem(PROGRESS_KEY)).toBe(saved);expect(session.current.state?.activeArrowIds.size).toBe(2);
  });
  it('the original celebration is deterministic, bounded and fades completely',()=>{
    const safe=gameplayLayout(390,844).safe;
    expect(celebrationParticles(.5,safe)).toEqual(celebrationParticles(.5,safe));
    for(const t of [0,.2,.5,.9,1])for(const p of celebrationParticles(t,safe)){
      expect(p.alpha).toBeGreaterThanOrEqual(0);expect(p.alpha).toBeLessThanOrEqual(1);
      expect(p.x).toBeGreaterThan(safe.x);expect(p.x).toBeLessThan(safe.x+safe.width);
      expect(p.y).toBeGreaterThan(safe.y);expect(p.y).toBeLessThan(safe.y+safe.height);
    }
    expect(celebrationParticles(1,safe).every(p=>p.alpha===0)).toBe(true);
  });
});
