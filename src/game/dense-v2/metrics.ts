import { analyzeDifficulty, countTurns } from '../difficulty';
import { buildOccupancy, cellKey, validateLevel } from '../rules';
import { attemptMove, completeEscape, createGameState } from '../state';
import type { Level } from '../types';

const histogram = (values: readonly number[]) => Object.fromEntries([...new Set(values)].sort((a,b)=>a-b).map(n=>[n,values.filter(v=>v===n).length]));
const distribution = (values: readonly number[]) => ({ histogram: histogram(values), mean: values.reduce((a,b)=>a+b,0)/Math.max(1,values.length), max: Math.max(0,...values) });

/** Plain serializable research data. No v1 score/tier is presented as a calibrated dense rating. */
export function measureDenseLevel(level: Level) {
  const analysis = analyzeDifficulty(level);
  if (!analysis.ok || !analysis.solvable) throw new RangeError('Dense metrics require a validated independently solved board.');
  const occupied = buildOccupancy(level), cells = level.arrows.flatMap(a=>a.cells), heads=level.arrows.map(a=>a.cells.at(-1)!);
  const rows = Array.from({length:level.height},(_,y)=>Array.from({length:level.width},(_,x)=>occupied.has(`${x},${y}`)?1:0).reduce<number>((a,b)=>a+b,0));
  const columns = Array.from({length:level.width},(_,x)=>Array.from({length:level.height},(_,y)=>occupied.has(`${x},${y}`)?1:0).reduce<number>((a,b)=>a+b,0));
  const longestRun = (values: readonly number[], predicate: (n:number)=>boolean) => {
    let run=0,longest=0; for(const value of values){run=predicate(value)?run+1:0;longest=Math.max(longest,run);}return longest;
  };
  const unseen = new Set(occupied.keys()), groups:number[]=[];
  while(unseen.size){
    const start=unseen.values().next().value!;unseen.delete(start);const queue=[start];
    for(let i=0;i<queue.length;i++){
      const [x,y]=queue[i]!.split(',').map(Number);
      for(const point of [{x:x!-1,y:y!},{x:x!+1,y:y!},{x:x!,y:y!-1},{x:x!,y:y!+1}]){
        const key=cellKey(point);if(unseen.delete(key))queue.push(key);
      }
    }
    groups.push(queue.length);
  }
  const safeChoices=analysis.metrics.safeChoiceCounts;
  return {
    width:level.width,height:level.height,arrowCount:level.arrows.length,capacity:level.width*level.height,
    occupiedCells:occupied.size,occupancy:occupied.size/(level.width*level.height),
    lengths:distribution(level.arrows.map(a=>a.cells.length)),turns:distribution(level.arrows.map(countTurns)),
    straightCount:level.arrows.filter(a=>countTurns(a)===0).length,
    bentCount:analysis.metrics.bentArrowCount,
    directions:Object.fromEntries(['up','right','down','left'].map(d=>[d,level.arrows.filter(a=>a.direction===d).length])),
    logic:{edges:analysis.metrics.blockingRelationships,maxDepth:analysis.metrics.longestChain,
      initialSafeFraction:analysis.metrics.initialSafeFraction,safeChoiceCounts:[...safeChoices],
      forcedChoiceFraction:analysis.metrics.forcedChoiceFraction,longestForcedStretch:longestRun(safeChoices,n=>n===1),
      dependencies:analysis.dependencies,solverTrace:analysis.solution.trace},
    composition:{occupiedConnectedGroups:groups.sort((a,b)=>b-a),rowOccupied:rows,columnOccupied:columns,
      longestEmptyRowBand:longestRun(rows,n=>n===0),longestEmptyColumnBand:longestRun(columns,n=>n===0),
      rowEmptyFractions:rows.map(n=>1-n/level.width),columnEmptyFractions:columns.map(n=>1-n/level.height),
      headPairsWithinTwoCells:heads.reduce((sum,a,i)=>sum+heads.slice(i+1).filter(b=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=2).length,0),
      maxHeadsInThreeByThree:Math.max(0,...heads.map(a=>heads.filter(b=>Math.abs(a.x-b.x)<=1&&Math.abs(a.y-b.y)<=1).length)),
      bounds:{minX:Math.min(...cells.map(p=>p.x)),maxX:Math.max(...cells.map(p=>p.x)),minY:Math.min(...cells.map(p=>p.y)),maxY:Math.max(...cells.map(p=>p.y))}},
  };
}
export type DenseMetrics = ReturnType<typeof measureDenseLevel>;

/** Verify the supplied witness AND an independent solver order through real Challenge transitions. */
export function verifyDenseCandidate(value: unknown, witness: readonly string[]) {
  const valid=validateLevel(value);if(!valid.valid)return {ok:false as const,message:'Geometry failed validation.'};
  const level=valid.level;
  if(!Array.isArray(witness))return {ok:false as const,message:'Expected a witness array.'};
  const analysis=analyzeDifficulty(level);
  if(!analysis.ok||!analysis.solution.solved)return {ok:false as const,message:'Independent solver did not solve the candidate.'};
  for(const order of [witness,analysis.solution.order]){
    if(order.length!==level.arrows.length||new Set(order).size!==order.length)return {ok:false as const,message:'Incomplete or repeated removal order.'};
    let state=createGameState(level,'challenge');
    for(const id of order){const move=attemptMove(state,id);if(move.type!=='exiting')return {ok:false as const,message:'Replay encountered a blocked or ignored move.'};state=completeEscape(move.state);}
    if(state.phase!=='won'||state.hearts!==3||state.mistakes!==0)return {ok:false as const,message:'Replay did not reach clean victory.'};
  }
  return {ok:true as const,solution:analysis.solution.order};
}
