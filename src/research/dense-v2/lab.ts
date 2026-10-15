import '../../styles.css';
import '../../gameplay.css';
import './lab.css';
import { mountGameBoard } from '../../graphics/game-board';
import { gameplayLayout } from '../../graphics/mobile-layout';
import { attemptMove, completeEscape, createGameState } from '../../game/state';
import type { GameMode, GameState, Level } from '../../game/types';
import type { DenseFamily, DenseStats } from '../../game/dense-v2/generator';
import type { DenseMetrics } from '../../game/dense-v2/metrics';
import type { LabRequest, LabReply } from './worker';
import { browserFeedback } from '../../feedback/game-feedback';
import { loadSettings } from '../../storage/settings';

// Dev-only entry point. No progress/session modules or storage/settings writes,
// campaign registration, or main application import. Vite's single production
// entry does not bundle this HTML, worker or generator.
const root=document.querySelector<HTMLDivElement>('#dense-lab')!;
const icon=(content:string)=>`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${content}</svg>`;
root.innerHTML=`<main id="game-screen" class="game-screen immersive-game" aria-label="Dense v2 experimental lab">
  <canvas id="game-canvas" role="application" tabindex="0" aria-label="Preparing research puzzle"></canvas>
  <div id="top-hud" class="game-overlay immersive-hud"><button id="lab-open" class="level-pause" aria-label="Lab controls" aria-haspopup="dialog">${icon('<path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="2"/>')}<span id="lab-label">RESEARCH</span></button><div id="hearts" role="img" aria-label="3 hearts remaining">♥ ♥ ♥</div><p id="difficulty">LAB ONLY</p></div>
  <div id="floating-controls" class="game-overlay floating-controls"><button id="zoom-in" class="float-control" aria-label="Magnify puzzle">${icon('<circle cx="10.5" cy="10.5" r="6" stroke="currentColor" stroke-width="1.5"/><path d="m15 15 5 5M8 10.5h5M10.5 8v5" stroke="currentColor" stroke-width="1.5"/>')}</button><button id="center" class="float-control" aria-label="Reset view">${icon('<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5"/>')}</button></div>
  <p id="lab-status" class="sr-only" role="status" aria-live="polite"></p><p id="game-toast" class="game-toast" hidden></p><div id="load-panel" class="load-panel"><p id="load-text" role="status">Generating a verified research sample in a worker…</p></div>
</main>
<dialog id="lab-controls" class="pause-sheet" aria-labelledby="controls-title"><h2 id="controls-title">Dense v2 · Research</h2><p>Experimental. No saves, unlocks or campaign changes.</p>
  <button id="resume" class="primary-button">Resume puzzle</button><div class="pause-actions"><button id="restart" class="secondary-button">Restart sample</button><button id="fit" class="secondary-button">Reset view</button></div>
  <label>Family<select id="family" aria-label="Family"><option value="A">A · 17×29 · 40–55 paths</option><option value="B">B · 23×37 · 60–85 paths</option><option value="v1-11">v1 Level 11 · 7 paths · motion QA</option><option value="v1">Compare v1 Level 81 (different puzzle)</option></select></label>
  <label>Seed<input id="seed" type="number" min="0" max="4294967295" step="1" value="0"></label>
  <label>Requested paths (blank = seeded)<input id="arrow-count" type="number" min="40" max="85" step="1" placeholder="Automatic"></label>
  <button id="generate" class="secondary-button">Generate sample</button>
  <label>Mode<select id="mode" aria-label="Mode"><option value="challenge">Challenge · three hearts</option><option value="zen">Zen · unlimited retries</option></select></label>
  <label class="motion-option"><input id="normal-motion" type="checkbox"> Full motion QA override (this lab only)</label>
  <p id="motion-diagnostic"></p><label class="motion-option"><input id="lab-sound" type="checkbox"> Sound (session-only test preference)</label><label class="motion-option"><input id="lab-haptics" type="checkbox"> Haptics, if supported (session only)</label>
  <details><summary>Research metrics &amp; help</summary><p>Tap a real path. Hold to preview its full shape and forward ruler; release makes no attempt. Arrow keys select; P toggles preview, Escape dismisses, Enter/Space extracts. Pinch/wheel to zoom, drag to pan; reset returns to overview. Ambiguous contacts magnify without an attempt.</p><p>Human difficulty is uncalibrated. This is not a Dense campaign. Sound/haptics start from the saved preferences, with session-only test overrides. Motion QA override never changes saved or system preferences.</p><pre id="metrics"></pre></details>
  <p><a href="http://127.0.0.1:4173/">Open existing campaign preview</a></p>
</dialog>
<dialog id="lab-result" class="game-result" aria-labelledby="result-title"><p class="eyebrow">REAL ENGINE RESULT</p><h2 id="result-title"></h2><p id="result-copy"></p><div class="pause-actions"><button id="result-restart" class="secondary-button">Restart sample</button><button id="result-controls" class="secondary-button">Lab controls</button></div></dialog>`;

const required=<T extends HTMLElement>(id:string)=>document.getElementById(id)! as T;
const listeners=new AbortController();
const listen=(target:EventTarget,type:string,callback:EventListener)=>target.addEventListener(type,callback,{signal:listeners.signal});
const canvas=required<HTMLCanvasElement>('game-canvas'),game=required<HTMLElement>('game-screen');
const controls=required<HTMLDialogElement>('lab-controls'),resultDialog=required<HTMLDialogElement>('lab-result');
const mode=required<HTMLSelectElement>('mode'),family=required<HTMLSelectElement>('family'),seed=required<HTMLInputElement>('seed');
const normal=required<HTMLInputElement>('normal-motion'),motion=matchMedia('(prefers-reduced-motion: reduce)');
const preferences=loadSettings((()=>{try{return window.localStorage;}catch{return undefined;}})(),motion.matches);
const sound=required<HTMLInputElement>('lab-sound'),haptics=required<HTMLInputElement>('lab-haptics');
sound.checked=preferences.sound;haptics.checked=preferences.haptics;
const feedback=browserFeedback(preferences,status=>{canvas.dataset.audioState=status.state;canvas.dataset.audioEvent=status.event;canvas.dataset.audioVoices=String(status.voices);});
let state:GameState|undefined,committed:GameState|undefined,worker:Worker|undefined,generation=0,escapeToken=0;
let activeRequest:LabRequest|undefined;
let toastTimer:ReturnType<typeof setTimeout>|undefined;
let installed:{level:Level;metrics:DenseMetrics;solution:readonly string[];generationMs:number;stats?:DenseStats}|undefined;
// Bounded observer of the renderer's existing QA diagnostics, not an idle loop.
// Mutation delivery can coalesce paints, so these are sampled draw CPU costs.
const paintSamples:number[]=[];
const paintObserver=new MutationObserver(()=>{
  const ms=Number(canvas.dataset.lastPaintMs);if(!Number.isFinite(ms))return;
  paintSamples.push(ms);if(paintSamples.length>256)paintSamples.shift();
  const sorted=[...paintSamples].sort((a,b)=>a-b);
  canvas.dataset.sampledPaintMeanMs=String(paintSamples.reduce((a,b)=>a+b,0)/paintSamples.length);
  canvas.dataset.sampledPaintP95Ms=String(sorted[Math.ceil(sorted.length*.95)-1]);
  canvas.dataset.sampledPaintCount=String(paintSamples.length);
});
paintObserver.observe(canvas,{attributes:true,attributeFilter:['data-paint-count']});
const reduced=()=>!normal.checked&&(motion.matches||preferences.reducedMotion);
function motionDiagnostic(){
  document.documentElement.dataset.reducedMotion=String(reduced());
  document.documentElement.dataset.systemReducedMotion=String(motion.matches);
  document.documentElement.dataset.storedReducedMotion=String(preferences.reducedMotion);
  required('motion-diagnostic').textContent=`System reduced motion: ${motion.matches?'on':'off'}. Stored reduced motion: ${preferences.reducedMotion?'on':'off'}. Effective Canvas: ${reduced()?'reduced':'full travel'}${normal.checked?' · intentional lab QA override':''}.`;
}
function announce(message:string,visible=false){
  required('lab-status').textContent=message;
  if(visible){const toast=required('game-toast');clearTimeout(toastTimer);toast.textContent=message;toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true;},1800);}
}
function render(){
  board.setState(state);
  for(const id of ['zoom-in','center'])required<HTMLButtonElement>(id).disabled=!state||state.phase==='animating';
  required<HTMLButtonElement>('restart').disabled=!installed;
  canvas.setAttribute('aria-busy',String(!state));
  if(!state){canvas.setAttribute('aria-label','Preparing research puzzle');return;}
  const left=state.activeArrowIds.size,total=state.level.arrows.length;
  canvas.setAttribute('aria-label',`${activeRequest?.family.startsWith('v1')?`V1 Level ${activeRequest.family==='v1-11'?11:81} comparison`:`Dense ${activeRequest?.family} seed ${activeRequest?.seed}`}. ${left} of ${total} paths remaining. ${state.mode==='zen'?'Unlimited retries':`${state.hearts} hearts`}. ${state.moves} attempts.`);
  Object.assign(canvas.dataset,{levelId:state.level.id,arrows:String(total),remaining:String(left),attempts:String(state.moves),phase:state.phase,generationMs:String(installed?.generationMs),seed:String(activeRequest?.seed),family:activeRequest?.family??'',requestedArrows:String(activeRequest?.arrowCount??'auto')});
  required('hearts').textContent=state.mode==='zen'?'ZEN':Array.from({length:3},(_,i)=>i<state!.hearts?'♥':'♡').join(' ');
  required('hearts').setAttribute('aria-label',state.mode==='zen'?'Zen, unlimited retries':`${state.hearts} hearts remaining`);
  if(state.phase==='won'||state.phase==='lost'){
    clearTimeout(toastTimer);required('game-toast').hidden=true;
    required('result-title').textContent=state.phase==='won'?'Beautifully untangled.':'A fresh perspective.';
    required('result-copy').textContent=`${total-left} of ${total} real paths cleared. Research only; no progress was saved.`;
    if(!controls.open&&!resultDialog.open)resultDialog.showModal();
  }
}
function interrupt(){escapeToken++;board.cancel();clearTimeout(toastTimer);required('game-toast').hidden=true;if(state?.phase==='animating'){state=committed;render();}}
const board=mountGameBoard(canvas,id=>{
  if(!state)return;const move=attemptMove(state,id);if(move.type==='ignored')return;
  const token=++escapeToken;state=move.state;render();
  if(move.type==='blocked'){committed=state;board.flash([id,move.blockerId]);announce('A path blocks this route.',state.phase==='ready');}
  else board.escape(id,()=>{if(token!==escapeToken||state?.phase!=='animating')return;state=completeEscape(state);committed=state;render();announce('Path clear.');if(state.phase==='won')board.celebrate();});
},interrupt,reduced,message=>announce(message,message.startsWith('Close paths')),{
  feedback,
  safeRect:(width,height)=>{
    const css=getComputedStyle(game),inset=(side:string)=>Number.parseFloat(css.getPropertyValue(`--safe-${side}`))||0;
    const layout=gameplayLayout(width,height,{top:inset('top'),right:inset('right'),bottom:inset('bottom'),left:inset('left')});
    game.dataset.landscape=String(layout.landscape);
    for(const [id,rect]of [['top-hud',layout.hud],['floating-controls',layout.controls]]as const)Object.assign(required(id).style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    return layout.safe;
  },
});
function restart(){
  interrupt();if(!installed)return;resultDialog.close();controls.close();state=createGameState(installed.level,mode.value as GameMode);committed=state;render();board.resetView();announce('Fresh research sample.');canvas.focus();
}
function openControls(){interrupt();resultDialog.close();controls.showModal();}
function generate(){
  const value=Number(seed.value);
  if(seed.value.trim()===''||!Number.isInteger(value)||value<0||value>4294967295){announce('Enter a uint32 seed from 0 to 4294967295.',true);return;}
  interrupt();worker?.terminate();const token=++generation;installed=undefined;state=undefined;committed=undefined;render();
  canvas.style.visibility='hidden';paintSamples.length=0;required('lab-label').textContent='RESEARCH';required('metrics').textContent='Preparing…';
  controls.close();resultDialog.close();required('load-panel').hidden=false;required('load-text').textContent='Generating and independently verifying in a worker…';
  announce('Preparing research puzzle.');required('game-toast').hidden=true;
  worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<LabReply>)=>{
    if(token!==generation)return;worker?.terminate();worker=undefined;
    if(!event.data.ok){required('load-text').textContent=`No sample: ${event.data.message} Open Lab controls to choose another seed.`;canvas.setAttribute('aria-label','No research sample loaded');canvas.setAttribute('aria-busy','false');announce(event.data.message,true);return;}
    installed=event.data;activeRequest=request;required('load-panel').hidden=true;canvas.style.visibility='visible';
    required('lab-label').textContent=request.family.startsWith('v1')?`V1 · ${request.family==='v1-11'?11:81}`:`${request.family} · s${value}`;
    required('metrics').textContent=JSON.stringify({generationMs:installed!.generationMs,metrics:installed!.metrics,stats:installed!.stats},null,2);
    state=createGameState(installed!.level,mode.value as GameMode);committed=state;render();announce('Verified research sample ready.');canvas.focus();
  };
  worker.onerror=()=>{if(token!==generation)return;worker?.terminate();worker=undefined;required('load-text').textContent='Worker unavailable. Open Lab controls to retry.';announce('Research worker unavailable.',true);};
  const count=required<HTMLInputElement>('arrow-count');
  const request:LabRequest={family:family.value as DenseFamily|'v1'|'v1-11',seed:value,
    ...(family.value.startsWith('v1')||!count.value.trim()?{}:{arrowCount:Number(count.value)})};worker.postMessage(request);
}
listen(required('lab-open'),'click',openControls);
listen(required('resume'),'click',()=>{controls.close();render();canvas.focus();});
listen(controls,'close',()=>{if(!resultDialog.open)canvas.focus();});
listen(required('generate'),'click',generate);
listen(family,'change',()=>{const count=required<HTMLInputElement>('arrow-count');count.value='';count.disabled=family.value.startsWith('v1');count.min=family.value==='A'?'40':'60';count.max=family.value==='A'?'55':'85';});
for(const id of ['restart','result-restart'])listen(required(id),'click',restart);
listen(required('result-controls'),'click',openControls);
listen(required('zoom-in'),'click',()=>board.zoom(1.5));
for(const id of ['center','fit'])listen(required(id),'click',()=>board.resetView());
listen(mode,'change',restart);
listen(normal,'change',()=>{motionDiagnostic();if(reduced())board.settle();});
listen(motion,'change',()=>{motionDiagnostic();if(reduced())board.settle();});
for(const control of [sound,haptics])listen(control,'change',()=>feedback.configure({sound:sound.checked,haptics:haptics.checked}));
listen(resultDialog,'cancel',event=>event.preventDefault());
listen(window,'blur',interrupt);listen(window,'pagehide',()=>{interrupt();worker?.terminate();generation++;});
listen(document,'visibilitychange',()=>{if(document.hidden)interrupt();});
if(import.meta.hot)import.meta.hot.dispose(()=>{listeners.abort();generation++;worker?.terminate();paintObserver.disconnect();board.dispose();feedback.dispose();clearTimeout(toastTimer);});
motionDiagnostic();
generate();
