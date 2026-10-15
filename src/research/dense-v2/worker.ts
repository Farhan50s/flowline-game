import { generateDenseLevel } from '../../game/dense-v2/generator';
import type { DenseFamily } from '../../game/dense-v2/generator';
import type { DenseStats } from '../../game/dense-v2/generator';
import { measureDenseLevel } from '../../game/dense-v2/metrics';
import type { DenseMetrics } from '../../game/dense-v2/metrics';
import { getLevel } from '../../game/levels';
import type { Level } from '../../game/types';

export interface LabRequest { readonly seed:number;readonly family:DenseFamily|'v1'|'v1-11';readonly arrowCount?:number }
export type LabReply={readonly ok:true;readonly level:Level;readonly solution:readonly string[];readonly metrics:DenseMetrics;readonly generationMs:number;readonly stats?:DenseStats}
  |{readonly ok:false;readonly message:string;readonly generationMs?:number};
const respond=(reply:LabReply)=>self.postMessage(reply);
self.addEventListener('message',(event:MessageEvent<LabRequest>)=>{
  const start=performance.now();
  try{
    if(event.data.family==='v1'||event.data.family==='v1-11'){
      const result=getLevel(event.data.family==='v1-11'?11:81);
      if(!result.ok){respond({ok:false,message:result.message});return;}
      respond({ok:true,level:result.level,solution:result.analysis.solution.order,
        metrics:measureDenseLevel(result.level),generationMs:performance.now()-start});
    }else{
      const result=generateDenseLevel(event.data.seed,{family:event.data.family,
        ...(event.data.arrowCount===undefined?{}:{arrowCount:event.data.arrowCount})});
      respond({...result,generationMs:performance.now()-start});
    }
  }catch{respond({ok:false,message:'Research worker failed; no level was loaded.'});}
});
