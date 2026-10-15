import { createRng, isSeed } from '../rng';
import type { SeededRng } from '../rng';
import { buildOccupancy, firstBlocker, traceExitLane, vectorFor } from '../rules';
import { createGameState } from '../state';
import { countTurns } from '../difficulty';
import type { ArrowPath, Direction, GridPoint, Level } from '../types';
import { measureDenseLevel, verifyDenseCandidate } from './metrics';
import type { DenseMetrics } from './metrics';

/** Experimental namespace. Not imported by levels.ts or the shipping application. */
export const DENSE_RECIPE = 'procedural-v2-feasibility-r2';
export type DenseFamily = 'A' | 'B';
export const DENSE_FAMILIES = Object.freeze({
  A:Object.freeze({width:17,height:29,minArrows:40,maxArrows:55}),
  B:Object.freeze({width:23,height:37,minArrows:60,maxArrows:85}),
});
export interface DenseOptions {
  readonly family?: DenseFamily;
  readonly arrowCount?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly maxTurns?: number;
  readonly minOccupancy?: number;
  readonly maxOccupancy?: number;
  readonly candidateLimit?: number;
  readonly proposalsPerSlot?: number;
  readonly proposalLimit?: number;
  readonly repairLimit?: number;
}
interface Configuration extends Required<Omit<DenseOptions,'arrowCount'>> {
  readonly arrowCount:number|undefined;readonly width:number;readonly height:number;readonly minArrows:number;readonly maxArrows:number;
}
export interface DenseStats {
  readonly candidates:number;readonly proposals:number;readonly pathSteps:number;readonly headScanSteps:number;
  readonly acceptedInsertions:number;readonly repairs:number;readonly targetCount:number;readonly placedCount:number;
  readonly rejected:{readonly blockedHead:number;readonly shortPath:number;readonly quality:number;readonly packing:number};
}
export type DenseSuccess = {readonly ok:true;readonly recipe:typeof DENSE_RECIPE;readonly configuration:Configuration;
  readonly level:Level;readonly witness:readonly string[];readonly solution:readonly string[];readonly metrics:DenseMetrics;readonly stats:DenseStats};
export type DenseFailure = {readonly ok:false;readonly reason:'invalid-seed'|'invalid-options'|'impossible-capacity'|'budget-exhausted'|'verification-failed';readonly message:string;readonly stats:DenseStats};
export type DenseResult = DenseSuccess|DenseFailure;
const directions:readonly Direction[]=['up','right','down','left'];
const vectors=directions.map(vectorFor);

function freeze<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;
}
function configure(options:DenseOptions):Configuration|string {
  if(!options||typeof options!=='object'||Array.isArray(options))return 'Expected an options object.';
  const allowed=['family','arrowCount','minLength','maxLength','maxTurns','minOccupancy','maxOccupancy','candidateLimit','proposalsPerSlot','proposalLimit','repairLimit'];
  if(Object.keys(options).some(key=>!allowed.includes(key)))return 'Unsupported dense option.';
  const family=options.family===undefined?'A':options.family;if(family!=='A'&&family!=='B')return 'Only research families A and B are supported; expert is deferred.';
  const base=DENSE_FAMILIES[family];
  const config:Configuration={...base,arrowCount:options.arrowCount,minLength:3,maxLength:18,maxTurns:6,
    minOccupancy:.56,maxOccupancy:.80,candidateLimit:4,proposalsPerSlot:96,proposalLimit:26000,repairLimit:0,...options,family};
  const integer=(n:number,min:number,max:number)=>Number.isInteger(n)&&n>=min&&n<=max;
  if(config.arrowCount!==undefined&&!integer(config.arrowCount,base.minArrows,base.maxArrows))return 'Arrow count lies outside the selected family exploration range.';
  if(!integer(config.minLength,3,18)||!integer(config.maxLength,config.minLength,24)||!integer(config.maxTurns,1,6))return 'Lengths must satisfy 3 <= min <= max <= 24; turns 1..6.';
  if(!Number.isFinite(config.minOccupancy)||!Number.isFinite(config.maxOccupancy)||config.minOccupancy<.3||config.maxOccupancy>.9||config.minOccupancy>config.maxOccupancy)return 'Occupancy must satisfy .3 <= min <= max <= .9.';
  if(!integer(config.candidateLimit,1,4)||!integer(config.proposalsPerSlot,1,192)||!integer(config.proposalLimit,1,60000)||!integer(config.repairLimit,0,6))return 'Budgets: candidates 1..4, proposals/slot 1..192, total proposals 1..60000, repairs/candidate 0..6.';
  return config;
}

/** Reverse construction: each new head ray is empty relative to all earlier
 * insertions and its own body. Removing in reverse order therefore restores
 * exactly the occupancy in which every insertion was proved escapable.
 * Integer operation budgets, not elapsed time, decide geometry/termination.
 */
export function generateDenseLevel(seed:number,options:DenseOptions={}):DenseResult {
  const stats={candidates:0,proposals:0,pathSteps:0,headScanSteps:0,acceptedInsertions:0,repairs:0,targetCount:0,placedCount:0,
    rejected:{blockedHead:0,shortPath:0,quality:0,packing:0}};
  const fail=(reason:DenseFailure['reason'],message:string):DenseFailure=>freeze({ok:false,reason,message,stats:{...stats,rejected:{...stats.rejected}}});
  if(!isSeed(seed))return fail('invalid-seed','Expected a uint32 seed (0..4294967295).');
  const config=configure(options);if(typeof config==='string')return fail('invalid-options',config);
  const {width,height}=config,capacity=width*height;
  const minimumCount=config.arrowCount??config.minArrows,maximumCount=config.arrowCount??config.maxArrows;
  if(minimumCount*config.minLength>Math.floor(capacity*config.maxOccupancy)||maximumCount*config.maxLength<Math.ceil(capacity*config.minOccupancy))return fail('impossible-capacity','Count × path bounds cannot meet occupancy/cell capacity.');
  const rng=createRng(seed);
  const recipe=Object.values(config).map(v=>v??'auto').join('-');
  const id=`${DENSE_RECIPE}-${seed.toString(16).padStart(8,'0')}-${recipe}`;
  for(let candidate=0;candidate<config.candidateLimit&&stats.proposals<config.proposalLimit;candidate++){
    stats.candidates++;
    const target=config.arrowCount??rng.int(config.minArrows,config.maxArrows+1);stats.targetCount=target;
    const arrows:ArrowPath[]=[],occupied=new Uint16Array(capacity),pressure=new Uint16Array(capacity);
    let used=0,repairs=0;
    const draft=():Level=>({id,seed,width,height,arrows});
    const repair=()=>{
      if(repairs>=config.repairLimit||arrows.length===0)return false;
      repairs++;stats.repairs++;arrows.splice(Math.max(0,arrows.length-6));occupied.fill(0);pressure.fill(0);used=0;
      arrows.forEach((a,index)=>{for(const p of a.cells){occupied[p.y*width+p.x]=index+1;used++;}for(const p of traceExitLane(a,config)){const key=p.y*width+p.x;pressure[key]=pressure[key]!+1;}});
      return true;
    };
    while(arrows.length<target&&stats.proposals<config.proposalLimit){
      const slot=arrows.length;
      // At most capacity*4 head entries. No unbounded caches or graph search.
      const heads:{point:GridPoint;direction:number}[]=[];
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        if(occupied[y*width+x])continue;
        for(let d=0;d<4;d++){
          const v=vectors[d]!,previous={x:x-v.x,y:y-v.y};
          if(previous.x<0||previous.x>=width||previous.y<0||previous.y>=height||occupied[previous.y*width+previous.x])continue;
          let clear=true;
          for(let px=x+v.x,py=y+v.y;px>=0&&px<width&&py>=0&&py<height;px+=v.x,py+=v.y){stats.headScanSteps++;if(occupied[py*width+px]){clear=false;break;}}
          if(clear)heads.push({point:{x,y},direction:d});
        }
      }
      if(!heads.length){stats.rejected.packing++;if(repair())continue;break;}
      const available=Math.floor(capacity*config.maxOccupancy)-used-(target-slot-1)*config.minLength;
      // B needs more negative space to retain open head lanes at its larger
      // arrow count. This geometry-affecting change is isolated in recipe r2.
      const targetOccupancy=config.family==='A'?.70:.62;
      const desired=Math.max(config.minLength,Math.min(config.maxLength,(capacity*targetOccupancy-used)/(target-slot)));
      let best:ArrowPath|undefined,bestScore=-Infinity;
      for(let proposal=0;proposal<config.proposalsPerSlot&&stats.proposals<config.proposalLimit;proposal++){
        stats.proposals++;
        const head=heads[rng.int(0,heads.length)]!;
        const length=Math.min(available,config.maxLength,Math.max(config.minLength,Math.round(desired)+rng.int(-3,4)));
        const arrow=growPath(rng,head.point,head.direction,length,occupied,config,slot,()=>stats.pathSteps++);
        if(!arrow){stats.rejected.shortPath++;continue;}
        const turns=countTurns(arrow),influence=arrow.cells.reduce((sum,p)=>sum+pressure[p.y*width+p.x]!,0);
        const repeatedHeads=arrows.filter(a=>a.direction===arrow.direction).length;
        const score=-Math.abs(arrow.cells.length-desired)*1.7+Math.min(turns,3)*1.1+Math.min(influence,12)*.6-repeatedHeads*.035;
        if(score>bestScore){best=arrow;bestScore=score;}
      }
      if(!best){stats.rejected.packing++;if(repair())continue;break;}
      // The canonical rule verifies every accepted insertion, independently of
      // the integer frontier accelerator used for proposals above.
      if(firstBlocker(best,buildOccupancy(draft()),config)!==null)return fail('verification-failed','Canonical insertion rule rejected frontier accelerator output.');
      arrows.push(best);used+=best.cells.length;stats.acceptedInsertions++;
      for(const p of best.cells)occupied[p.y*width+p.x]=slot+1;
      for(const p of traceExitLane(best,config)){const index=p.y*width+p.x;pressure[index]=pressure[index]!+1;}
    }
    stats.placedCount=arrows.length;
    if(arrows.length!==target){stats.rejected.packing++;continue;}
    const witness=arrows.map(a=>a.id).reverse(),verification=verifyDenseCandidate(draft(),witness);
    if(!verification.ok)return fail('verification-failed',verification.message);
    const metrics=measureDenseLevel(draft()),bounds=metrics.composition.bounds;
    if(metrics.occupancy<config.minOccupancy||metrics.lengths.mean<6||metrics.turns.mean<1.5||metrics.bentCount/target<.7
      ||metrics.logic.edges<target*.8||metrics.logic.initialSafeFraction>.5||(metrics.logic.maxDepth??0)<4
      ||bounds.maxY-bounds.minY<height-3||bounds.maxX-bounds.minX<width-3){stats.rejected.quality++;continue;}
    return freeze({ok:true,recipe:DENSE_RECIPE,configuration:config,level:createGameState(draft(),'challenge').level,
      witness,solution:verification.solution,metrics,stats:{...stats,rejected:{...stats.rejected}}});
  }
  return fail('budget-exhausted','No candidate met exact target count, winding/coverage/dependency gates within deterministic budgets.');
}

function growPath(rng:SeededRng,head:GridPoint,direction:number,length:number,occupied:Uint16Array,config:Configuration,slot:number,step:()=>void):ArrowPath|undefined {
  if(length<config.minLength)return;
  const {width,height}=config,forward=vectors[direction]!;
  const forbidden=new Set<number>();
  for(let x=head.x+forward.x,y=head.y+forward.y;x>=0&&x<width&&y>=0&&y<height;x+=forward.x,y+=forward.y)forbidden.add(y*width+x);
  const cells=[head],seen=new Set([head.y*width+head.x]);let previous=(direction+2)%4,turns=0;
  for(let i=1;i<length;i++){
    step();const p=cells.at(-1)!;
    const choices=[0,1,2,3].filter(d=>{
      if(i===1&&d!==previous||d!==previous&&turns>=config.maxTurns)return false;
      const v=vectors[d]!,x=p.x+v.x,y=p.y+v.y,key=y*width+x;
      return x>=0&&x<width&&y>=0&&y<height&&!occupied[key]&&!seen.has(key)&&!forbidden.has(key);
    });
    if(!choices.length)break;
    const d=choices.includes(previous)&&rng.next()<.56?previous:choices[rng.int(0,choices.length)]!;
    if(d!==previous)turns++;const v=vectors[d]!,point={x:p.x+v.x,y:p.y+v.y};cells.push(point);seen.add(point.y*width+point.x);previous=d;
  }
  if(cells.length<config.minLength)return;
  cells.reverse();return {id:`dense-arrow-${String(slot+1).padStart(3,'0')}`,direction:directions[direction]!,cells:cells as [GridPoint,...GridPoint[]]};
}
