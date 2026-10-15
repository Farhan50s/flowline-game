import { describe, expect, it } from 'vitest';
import { generateDenseLevel, DENSE_RECIPE } from '../game/dense-v2/generator';
import type { DenseFamily, DenseOptions } from '../game/dense-v2/generator';
import { verifyDenseCandidate, measureDenseLevel } from '../game/dense-v2/metrics';
import { measureDenseView } from '../research/dense-v2/view-metrics';
import { validateLevel, getSafeArrowIds } from '../game/rules';
import { solveLevel } from '../game/solver';
import { createGameState, attemptMove, completeEscape } from '../game/state';
import type { Level } from '../game/types';
import referenceA from './fixtures/dense-v2-r2-a-seed0.json';
import referenceB from './fixtures/dense-v2-r2-b-seed0.json';

const success=(family:DenseFamily,seed=0)=>{
  const result=generateDenseLevel(seed,{family});if(!result.ok)throw new Error(result.message);return result;
};
describe('isolated dense-v2 input and deterministic work bounds',()=>{
  it.each([-1,1.2,4294967296,NaN,Infinity,null,undefined,'1',{},[]])('rejects malformed seed %s before construction',seed=>{
    const result=generateDenseLevel(seed as number);expect(result).toMatchObject({ok:false,reason:'invalid-seed',stats:{proposals:0,candidates:0}});
  });
  const invalid:unknown[]=[null,[],{family:'C'},{family:null},{family:'easy'},{width:128},{arrowCount:39},{arrowCount:56},
    {family:'B',arrowCount:59},{family:'B',arrowCount:86},{minLength:2},{maxLength:25},{minLength:8,maxLength:7},
    {maxTurns:7},{maxTurns:0},{candidateLimit:5},{candidateLimit:0},{proposalsPerSlot:0},{proposalsPerSlot:193},
    {proposalLimit:0},{proposalLimit:60001},{repairLimit:7},{repairLimit:-1},{minOccupancy:NaN},{maxOccupancy:Infinity},
    {minOccupancy:.8,maxOccupancy:.7},{minOccupancy:.2},{maxOccupancy:.95}];
  it.each(invalid)('returns typed invalid options for %j',options=>{
    expect(generateDenseLevel(0,options as DenseOptions)).toMatchObject({ok:false,reason:'invalid-options',stats:{proposals:0}});
  });
  it('rejects impossible capacity before allocating proposals',()=>{
    expect(generateDenseLevel(0,{arrowCount:55,minLength:18,maxLength:18})).toMatchObject({ok:false,reason:'impossible-capacity',stats:{proposals:0}});
    expect(generateDenseLevel(0,{family:'B',arrowCount:85,minLength:18,maxLength:18})).toMatchObject({ok:false,reason:'impossible-capacity'});
  });
  it('exhausts tiny budgets without returning a partial board as success',()=>{
    const options={family:'B' as const,proposalLimit:1,candidateLimit:1,repairLimit:6};
    const result=generateDenseLevel(0,options);expect(result).toMatchObject({ok:false,reason:'budget-exhausted'});
    expect(result.stats.proposals).toBe(1);expect(result).not.toHaveProperty('level');expect(generateDenseLevel(0,options)).toEqual(result);
  });
  it('optional bounded repair rebuilds occupancy without breaking the reverse proof',()=>{
    const options={family:'A' as const,repairLimit:3};
    const result=generateDenseLevel(4,options);expect(result.stats.repairs).toBeGreaterThan(0);
    expect(result.stats.repairs).toBeLessThanOrEqual(12);expect(result.stats.proposals).toBeLessThanOrEqual(26000);
    expect(generateDenseLevel(4,options)).toEqual(result);
    if(result.ok)expect(verifyDenseCandidate(result.level,result.witness).ok).toBe(true);
    else expect(result.reason).toBe('budget-exhausted');
  });
  it.each([0,4294967295])('handles uint32 endpoint %s deterministically',seed=>{
    const first=generateDenseLevel(seed);expect(generateDenseLevel(seed)).toEqual(first);
    if(!first.ok)expect(first.reason).toBe('budget-exhausted');
  });
  it('retains explicit recipe namespace and complete pinned references',()=>{
    expect(DENSE_RECIPE).toBe('procedural-v2-feasibility-r2');
    expect(JSON.parse(JSON.stringify(success('A')))).toStrictEqual(referenceA);expect(JSON.parse(JSON.stringify(success('B')))).toStrictEqual(referenceB);
    expect(referenceA.level.id).toMatch(/^procedural-v2-/);expect(referenceA.level).not.toHaveProperty('difficulty');
  });
});

const cases=(['A','B']as const).flatMap(family=>Array.from({length:24},(_,seed)=>({family,seed})));
describe('fixed 24-seed pilot contracts per family',()=>{
  it.each(cases)('$family seed $seed is either independently verified or an honest bounded failure',({family,seed})=>{
    const result=generateDenseLevel(seed,{family});
    const failures=family==='A'?[2,22]:[2,3,8,9,10,20];expect(result.ok).toBe(!failures.includes(seed));
    expect(result.stats.proposals).toBeLessThanOrEqual(26000);expect(result.stats.candidates).toBeLessThanOrEqual(4);
    expect(result.stats.pathSteps).toBeLessThanOrEqual(result.stats.proposals*23);
    const capacity=family==='A'?493:851,maxDimension=family==='A'?29:37,maxArrows=family==='A'?55:85;
    expect(result.stats.headScanSteps).toBeLessThanOrEqual(4*(maxArrows+1)*capacity*4*maxDimension);
    expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.stats.rejected)).toBe(true);
    if(!result.ok){expect(result.reason).toBe('budget-exhausted');expect(result).not.toHaveProperty('level');return;}
    const level=result.level;expect(validateLevel(level).valid).toBe(true);expect(solveLevel(level).solved).toBe(true);
    expect(result.level.arrows.length).toBe(result.stats.targetCount);expect(result.metrics.occupancy).toBeGreaterThanOrEqual(.56);
    expect(result.metrics.lengths.mean).toBeGreaterThanOrEqual(6);expect(result.metrics.turns.mean).toBeGreaterThanOrEqual(1.5);
    expect(result.metrics.turns.max).toBeLessThanOrEqual(6);expect(result.metrics.lengths.max).toBeLessThanOrEqual(18);
    expect(result.metrics.logic.maxDepth).toBeGreaterThanOrEqual(4);expect(measureDenseLevel(level)).toEqual(result.metrics);
    const orderIndex=new Map(level.arrows.map((a,i)=>[a.id,i]));
    for(const entry of result.metrics.logic.dependencies)for(const blocker of entry.blockerIds)expect(orderIndex.get(blocker)!).toBeGreaterThan(orderIndex.get(entry.arrowId)!);
    expect(result.witness).toEqual(level.arrows.map(a=>a.id).reverse());
    for(const order of [result.witness,result.solution]){
      let state=createGameState(level,'challenge');
      for(const id of order){const before=state,move=attemptMove(state,id);expect(move.type).toBe('exiting');expect(move.state.activeArrowIds.size).toBe(before.activeArrowIds.size);state=completeEscape(move.state);expect(before.activeArrowIds.has(id)).toBe(true);}
      expect(state).toMatchObject({phase:'won',hearts:3,mistakes:0,moves:level.arrows.length});
    }
    expect(Object.isFrozen(level.arrows[0]!.cells[0])).toBe(true);expect(Object.isFrozen(result.metrics.logic.solverTrace)).toBe(true);
    expect(Object.isFrozen(result.configuration)).toBe(true);
  });
});

describe('independent verification cannot trust a supplied witness',()=>{
  const level=referenceA.level as unknown as Level;
  it('rejects truncated, repeated, fabricated and actually blocked orders',()=>{
    const solved=solveLevel(level);expect(solved.solved).toBe(true);
    expect(verifyDenseCandidate(level,solved.order).ok).toBe(true);
    for(const order of [[],solved.order.slice(1),solved.order.map(()=>solved.order[0]!),['invented',...solved.order.slice(1)]])expect(verifyDenseCandidate(level,order).ok).toBe(false);
    const safe=getSafeArrowIds(createGameState(level,'challenge')),blocked=level.arrows.find(a=>!safe.includes(a.id))!.id;
    expect(verifyDenseCandidate(level,[blocked,...solved.order.filter(id=>id!==blocked)]).ok).toBe(false);
  });
  it('rejects corrupted geometry rather than repairing a fake solution',()=>{
    const corrupted={...level,arrows:[{...level.arrows[0]!,direction:'left' as const,cells:[{x:-1,y:0},{x:0,y:0}]}]};
    expect(verifyDenseCandidate(corrupted,['dense-arrow-001']).ok).toBe(false);
  });
  it('rejects a valid deadlocked board despite a complete-looking witness',()=>{
    const deadlock:Level={id:'deadlock',width:5,height:3,arrows:[
      {id:'a',direction:'right',cells:[{x:0,y:1},{x:1,y:1}]},
      {id:'b',direction:'left',cells:[{x:4,y:1},{x:3,y:1}]},
    ]};
    expect(validateLevel(deadlock).valid).toBe(true);expect(verifyDenseCandidate(deadlock,['a','b']).ok).toBe(false);
  });
  it('real dense blocked moves consume Challenge hearts and preserve geometry',()=>{
    const initial=createGameState(level,'challenge'),safe=getSafeArrowIds(initial),blocked=level.arrows.find(a=>!safe.includes(a.id))!.id;
    const before=JSON.stringify(initial.level),move=attemptMove(initial,blocked);expect(move.type).toBe('blocked');
    expect(move.state).toMatchObject({hearts:2,mistakes:1,moves:1,phase:'ready'});expect(initial.hearts).toBe(3);expect(JSON.stringify(initial.level)).toBe(before);
    expect(attemptMove(createGameState(level,'zen'),blocked).state.hearts).toBe(3);
  });
});

describe('explicit 85-arrow upper-bound experiment',()=>{
  it.each(Array.from({length:12},(_,seed)=>seed))('B seed %s never substitutes a smaller target',seed=>{
    const result=generateDenseLevel(seed,{family:'B',arrowCount:85});expect(result.ok).toBe(![1,5,6].includes(seed));
    expect(result.stats.proposals).toBeLessThanOrEqual(26000);
    if(result.ok){expect(result.level.arrows).toHaveLength(85);expect(result.stats.targetCount).toBe(85);expect(verifyDenseCandidate(result.level,result.witness).ok).toBe(true);}
    else expect(result).toMatchObject({reason:'budget-exhausted'});
  });
});

describe('mobile dense overview and working-view contact geometry',()=>{
  const viewCases=(['A','B']as const).flatMap(family=>[[320,568],[390,844],[844,390]].map(([width,height])=>({family,width:width!,height:height!})));
  it.each(viewCases)('$family at $width × $height fits true tall geometry and can reach a 32px working cell within 4×',({family,width,height})=>{
    const level=(family==='A'?referenceA:referenceB).level as unknown as Level;
    const overview=measureDenseView(level,width,height),working=measureDenseView(level,width,height,family==='A'?2:3);
    expect(overview.maxFourTimesEnoughFor32).toBe(true);expect(overview.zoomFor24px).toBeLessThanOrEqual(4);
    expect(overview.exact.wrong).toBe(0);expect(overview.exact.miss).toBe(0);expect(working.exact.wrong).toBe(0);
    expect(working.cell).toBeGreaterThanOrEqual(24);expect(working.stroke).toBeGreaterThanOrEqual(1.8);
    expect(overview.centerlineBounds.minX).toBeGreaterThan(overview.safe.x);expect(overview.centerlineBounds.maxX).toBeLessThan(overview.safe.x+overview.safe.width);
    expect(overview.centerlineBounds.minY).toBeGreaterThan(overview.safe.y);expect(overview.centerlineBounds.maxY).toBeLessThan(overview.safe.y+overview.safe.height);
  });
});
