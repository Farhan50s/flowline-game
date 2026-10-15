// Offline research runner. Never imported by the shipping UI or native package.
import { createServer } from 'vite';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, platform } from 'node:os';
import { dirname } from 'node:path';
const option=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1]??fallback;};
const family=option('--family','A'),count=Number(option('--count','24')),start=Number(option('--start','0'));
const requestedArrows=option('--arrows',undefined);
const options={family,...(requestedArrows===undefined?{}:{arrowCount:Number(requestedArrows)})};
const output=option('--out',`docs/verification/DENSE_V2_${family}_${count}.json`);
if(!['A','B'].includes(family)||!Number.isInteger(count)||count<1||count>1000||!Number.isInteger(start)||start<0||start+count>4294967296)throw new Error('Invalid bounded sample arguments.');
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try{
  const {generateDenseLevel,DENSE_RECIPE}=await server.ssrLoadModule('/src/game/dense-v2/generator.ts');
  const {verifyDenseCandidate}=await server.ssrLoadModule('/src/game/dense-v2/metrics.ts');
  const records=[];
  for(let seed=start;seed<start+count;seed++){
    const heapBefore=process.memoryUsage().heapUsed,t=performance.now(),result=generateDenseLevel(seed,options),ms=performance.now()-t;
    const heapDelta=process.memoryUsage().heapUsed-heapBefore;
    const repeated=generateDenseLevel(seed,options);
    if(JSON.stringify(result)!==JSON.stringify(repeated))throw new Error(`Nondeterministic ${family}:${seed}`);
    if(result.ok&&!verifyDenseCandidate(result.level,result.witness).ok)throw new Error(`Replay failed ${family}:${seed}`);
    records.push({seed,ms,heapDelta,ok:result.ok,...(result.ok?{id:result.level.id,geometrySha256:createHash('sha256').update(JSON.stringify(result.level.arrows.map(a=>[a.direction,a.cells]))).digest('hex'),metrics:result.metrics}: {reason:result.reason,message:result.message}),stats:result.stats});
  }
  const successes=records.filter(r=>r.ok),times=records.map(r=>r.ms).sort((a,b)=>a-b);
  const mean=values=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
  const summary={family,requestedArrows:requestedArrows===undefined?'auto':Number(requestedArrows),count,seedRange:[start,start+count-1],successes:successes.length,failures:records.filter(r=>!r.ok).map(({seed,reason,stats})=>({seed,reason,stats})),
    uniqueLayouts:new Set(successes.map(r=>r.geometrySha256)).size,meanMs:mean(times),p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.ceil(times.length*.95)-1],maxMs:Math.max(...times),
    meanArrows:mean(successes.map(r=>r.metrics.arrowCount)),meanOccupancy:mean(successes.map(r=>r.metrics.occupancy)),meanLength:mean(successes.map(r=>r.metrics.lengths.mean)),meanTurns:mean(successes.map(r=>r.metrics.turns.mean)),
    meanEdges:mean(successes.map(r=>r.metrics.logic.edges)),meanDepth:mean(successes.map(r=>r.metrics.logic.maxDepth)),meanInitialSafeFraction:mean(successes.map(r=>r.metrics.logic.initialSafeFraction)),
    proposals:records.reduce((s,r)=>s+r.stats.proposals,0),maxObservedPositiveHeapDelta:Math.max(0,...records.map(r=>r.heapDelta))};
  const report={runtime:process.version,platform:platform(),cpu:cpus()[0]?.model,recipe:DENSE_RECIPE,
    sourceSha256:Object.fromEntries(['generator','metrics'].map(name=>[name,createHash('sha256').update(readFileSync(`src/game/dense-v2/${name}.ts`)).digest('hex')])),
    note:'Node Vite SSR loader. generate timing includes validation, independent solver, both engine replays and composition metrics. Determinism/replay checks outside timing. Heap deltas are post-call samples affected by GC, not peak memory. Not a phone benchmark.',summary,records};
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
}finally{await server.close();}
