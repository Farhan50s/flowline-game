import type { GridPoint, Level } from '../../game/types';
import { gameplayLayout, containsPoint, lineStyle } from '../../graphics/mobile-layout';
import { boardTransform } from '../../graphics/viewport';
import { touchTarget } from '../../input/hit';

/** Reproducible contact probes, not a model calibrated against real fingers.
 * Uses the exact shipping transform, clip, 44px search diameter and ambiguity rule.
 */
export function measureDenseView(level:Level,width:number,height:number,zoom=1){
  const safe=gameplayLayout(width,height).safe;
  const transform=boardTransform({width,height,columns:level.width,rows:level.height,safe},{zoom,x:0,y:0});
  const active=new Set(level.arrows.map(a=>a.id)),times:number[]=[];
  const contacts:{id:string;point:GridPoint}[]=[];
  for(const arrow of level.arrows)for(let i=1;i<arrow.cells.length;i++){
    const a=transform.toCSS(arrow.cells[i-1]!),b=transform.toCSS(arrow.cells[i]!);
    const point={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(containsPoint(safe,point))contacts.push({id:arrow.id,point});
  }
  const probe=(offsets:readonly GridPoint[])=>{
    const counts={correct:0,ambiguous:0,miss:0,wrong:0,outside:0};
    for(const {id,point} of contacts)for(const offset of offsets){
      const contact={x:point.x+offset.x,y:point.y+offset.y};if(!containsPoint(safe,contact)){counts.outside++;continue;}
      const start=performance.now(),target=touchTarget(contact,level.arrows,active,transform.toCSS,22,safe);times.push(performance.now()-start);
      if(target.type==='selected')counts[target.id===id?'correct':'wrong']++;else counts[target.type==='ambiguous'?'ambiguous':'miss']++;
    }
    return counts;
  };
  const exact=probe([{x:0,y:0}]);
  const jitter6=probe([{x:6,y:0},{x:-6,y:0},{x:0,y:6},{x:0,y:-6}]);
  const stress22=probe([{x:22,y:0},{x:-22,y:0},{x:0,y:22},{x:0,y:-22}]);
  times.sort((a,b)=>a-b);
  const points=level.arrows.flatMap(a=>a.cells.map(transform.toCSS));
  return {viewport:{width,height},safe,zoom,cell:transform.cell,...lineStyle(transform.cell),
    zoomFor24px:24/(transform.cell/zoom),zoomFor32px:32/(transform.cell/zoom),maxFourTimesEnoughFor32:transform.cell/zoom*4>=32,
    visibleSegmentCenters:contacts.length,exact,jitter6,stress22,
    centerlineBounds:{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))},
    hitProcessingMs:{mean:times.reduce((a,b)=>a+b,0)/Math.max(1,times.length),p95:times[Math.max(0,Math.ceil(times.length*.95)-1)]??0,max:Math.max(0,...times)},
  };
}
