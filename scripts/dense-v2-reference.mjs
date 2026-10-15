// Explicit recipe fixture maintenance. --write is for an intentionally new recipe;
// normal invocation only verifies pinned reference data.
import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try{
  const {generateDenseLevel,DENSE_RECIPE}=await server.ssrLoadModule('/src/game/dense-v2/generator.ts');
  const {measureDenseView}=await server.ssrLoadModule('/src/research/dense-v2/view-metrics.ts');
  const views=[];
  for(const family of ['A','B']){
    const result=generateDenseLevel(0,{family});assert(result.ok,`${family}:0 must be a verified representative`);
    const file=`src/tests/fixtures/dense-v2-r2-${family.toLowerCase()}-seed0.json`;
    if(process.argv.includes('--write')){mkdirSync('src/tests/fixtures',{recursive:true});writeFileSync(file,JSON.stringify(result,null,2)+'\n');}
    else assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(readFileSync(file,'utf8')));
    for(const [width,height]of [[320,568],[390,844],[844,390]])for(const zoom of [1,family==='A'?2:3,4])views.push({family,seed:0,...measureDenseView(result.level,width,height,zoom)});
  }
  mkdirSync('docs/verification',{recursive:true});writeFileSync('docs/verification/DENSE_V2_VIEW_ANALYSIS.json',JSON.stringify({recipe:DENSE_RECIPE,note:'Exact segment-center contacts, ±6px axis jitter, and ±22px stress displacements; hypothetical intended-arrow errors, not real-device probabilities. Zoom probes use centered pan and clip. CPU timings are Node host calls, not phone input latency.',views},null,2)+'\n');
  console.log(`Pinned ${DENSE_RECIPE} representatives ${process.argv.includes('--write')?'written':'verified'}; ${views.length} view/zoom cases measured.`);
}finally{await server.close();}
