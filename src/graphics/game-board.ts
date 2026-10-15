import type { ArrowPath, GameState, GridPoint } from '../game/types';
import { directionVectors, backingSize } from './geometry';
import { boardTransform, boundView, HOME_VIEW, zoomAt } from './viewport';
import type { BoardSpace, View } from './viewport';
import { BoardGesture } from '../input/gestures';
import { hitArrow, touchTarget } from '../input/hit';
import { curveWindow, departureDuration, EscapeAnimator, extractionFor } from './animation';
import type { MotionTiming } from './animation';
import { containsPoint, lineStyle } from './mobile-layout';
import type { ScreenRect } from './mobile-layout';
import { celebrationParticles } from './celebration';
import { lanePreview, sourceTrail, trailOpacity } from './path-effects';
import type { TrailPoint } from './path-effects';
import type { GameplayFeedback } from '../feedback/game-feedback';

function strokePath(ctx: CanvasRenderingContext2D, points: readonly GridPoint[], arrow: ArrowPath, cell: number, refined = false) {
  if (points.length < 2) return;
  ctx.beginPath(); ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!, b = points[i]!, c = points[i + 1]!;
    const incoming = Math.hypot(b.x - a.x, b.y - a.y), outgoing = Math.hypot(c.x - b.x, c.y - b.y);
    const radius = Math.min(refined ? lineStyle(cell).corner : cell * .19, incoming / 2, outgoing / 2);
    if (!radius) { ctx.lineTo(b.x, b.y); continue; }
    ctx.lineTo(b.x - (b.x - a.x) / incoming * radius, b.y - (b.y - a.y) / incoming * radius);
    ctx.quadraticCurveTo(b.x, b.y, b.x + (c.x - b.x) / outgoing * radius, b.y + (c.y - b.y) / outgoing * radius);
  }
  const head = points.at(-1)!;
  ctx.lineTo(head.x, head.y); ctx.stroke();
  const v = directionVectors[arrow.direction], size = refined ? lineStyle(cell).head : Math.max(5, cell * .25);
  ctx.beginPath(); ctx.moveTo(head.x + v.x * size * .24, head.y + v.y * size * .24);
  ctx.lineTo(head.x - v.x * size - v.y * size * .7, head.y - v.y * size + v.x * size * .7);
  ctx.lineTo(head.x - v.x * size + v.y * size * .7, head.y - v.y * size - v.x * size * .7);
  ctx.closePath(); ctx.fill();
}

export interface GameBoard {
  setState(state: GameState | undefined): void;
  escape(id: string, complete: () => void): void;
  cancel(): void;
  settle(): void;
  flash(ids: readonly string[]): void;
  resetView(): void;
  zoom(factor: number): number | undefined;
  celebrate(): void;
  dispose(): void;
}
export function mountGameBoard(canvas: HTMLCanvasElement, attempt: (id: string) => void,
  interrupted: () => void, reduced: () => boolean, announce: (message: string) => void,
  configuration: { readonly safeRect?: (width: number, height: number) => ScreenRect;
    readonly feedback?: GameplayFeedback; readonly holdThresholdMs?: number; readonly motionTiming?: MotionTiming } = {}): GameBoard {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  const ctx = context;
  const abort = new AbortController(), options = { signal: abort.signal };
  const animator = new EscapeAnimator({ request: callback => window.requestAnimationFrame(callback), cancel: id => window.cancelAnimationFrame(id) });
  const effects = new EscapeAnimator({ request: callback => window.requestAnimationFrame(callback), cancel: id => window.cancelAnimationFrame(id) });
  const trailFade = new EscapeAnimator({ request: callback => window.requestAnimationFrame(callback), cancel: id => window.cancelAnimationFrame(id) });
  const refined = configuration.safeRect !== undefined;
  let state: GameState | undefined, view: View = HOME_VIEW;
  let space: BoardSpace = { width: 1, height: 1, columns: 5, rows: 5 };
  let preview: ReturnType<typeof lanePreview>;
  const gesture = new BoardGesture(view, space, {
    ready: () => state?.phase === 'ready' && !disposed,
    thresholdMs: configuration.holdThresholdMs ?? 220,
    preview: id => showPreview(id),
  });
  let selected: string | undefined, exiting: readonly GridPoint[] | undefined;
  let blocked: readonly string[] = [], timer: ReturnType<typeof setTimeout> | undefined;
  let density: MediaQueryList | undefined, frame = 0, disposed = false;
  let paintCount = 0, maxPaintMs = 0;
  let exitingFraction = 0, blockPulse = 0, bloom: number | undefined;
  type Trail = { samples: readonly TrailPoint[]; tail: number; alpha: number };
  let activeTrail: Trail | undefined, fadingTrail: Trail | undefined, settling = false;

  function showPreview(id: string | undefined, keyboard = false) {
    const next = id && state ? lanePreview(state, id) : undefined;
    if (!preview && !next) return;
    preview = next;
    canvas.dataset.preview = next ? next.arrow.id : '';
    canvas.dataset.previewBlocker = next?.blockerId ?? '';
    canvas.dataset.previewContact = next?.contact ? JSON.stringify(next.contact) : '';
    announce(next ? `Route preview, pointing ${next.arrow.direction}. ${next.blockerId ? `Blocked by arrow ${state!.level.arrows.findIndex(a => a.id === next.blockerId) + 1}.` : 'Clear exit lane.'} ${keyboard ? 'P or Escape dismisses.' : 'Release to dismiss.'} No attempt made.` : 'Preview dismissed. No attempt made.');
    draw();
  }
  function clearInput() {
    const pointers = gesture.pointerIds(); gesture.cancel();
    for (const id of pointers) if (canvas.hasPointerCapture(id)) { try { canvas.releasePointerCapture(id); } catch { /* The browser may already have released it. */ } }
  }
  function clearTrails() { trailFade.cancel(); activeTrail = undefined; fadingTrail = undefined; canvas.dataset.trailDots = '0'; }

  function drawPreview(project: (p: GridPoint) => GridPoint, cell: number, teal: string, error: string) {
    if (!preview) return;
    const { arrow, lane, contact } = preview, v = directionVectors[arrow.direction];
    const points = [arrow.cells.at(-1)!, ...lane];
    const end = points.at(-1)!;
    points.push({ x: end.x + v.x * .55, y: end.y + v.y * .55 });
    let obstructed = false;
    ctx.lineWidth = 1.2; ctx.strokeStyle = teal; ctx.fillStyle = teal;
    for (let i = 1; i < points.length; i++) {
      const a = project(points[i - 1]!), b = project(points[i]!);
      ctx.globalAlpha = obstructed ? .13 : .48;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const tick = Math.max(2.4, Math.min(4.5, cell * .12));
      ctx.beginPath(); ctx.moveTo(b.x - v.y * tick, b.y + v.x * tick); ctx.lineTo(b.x + v.y * tick, b.y - v.x * tick); ctx.stroke();
      if (contact?.x === points[i]!.x && contact.y === points[i]!.y) {
        ctx.globalAlpha = .95; ctx.strokeStyle = error;
        ctx.beginPath(); ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x - 2.5, b.y - 2.5); ctx.lineTo(b.x + 2.5, b.y + 2.5); ctx.moveTo(b.x + 2.5, b.y - 2.5); ctx.lineTo(b.x - 2.5, b.y + 2.5); ctx.stroke();
        ctx.strokeStyle = teal; obstructed = true;
      }
    }
    const tip = project(points.at(-1)!);
    ctx.globalAlpha = obstructed ? .13 : .6;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - v.x * 5 - v.y * 3, tip.y - v.y * 5 + v.x * 3); ctx.lineTo(tip.x - v.x * 5 + v.y * 3, tip.y - v.y * 5 - v.x * 3); ctx.closePath(); ctx.fill();
  }

  function draw() {
    if (disposed || !state || !canvas.clientWidth || !canvas.clientHeight) return;
    const started = performance.now();
    const transform = boardTransform(space, view), tokens = getComputedStyle(canvas);
    const ink = tokens.getPropertyValue('--color-ink').trim(), teal = tokens.getPropertyValue('--color-accent-dark').trim();
    const error = tokens.getPropertyValue('--color-error-text').trim();
    ctx.clearRect(0, 0, space.width, space.height);
    const clip = space.safe ?? { x: 0, y: 0, width: space.width, height: space.height };
    ctx.save(); ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.width, clip.height); ctx.clip();
    ctx.fillStyle = tokens.getPropertyValue('--color-grid').trim();
    if (!refined) for (let y = 0; y < state.level.height; y++) for (let x = 0; x < state.level.width; x++) {
      const point = transform.toCSS({ x, y });
      ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(.8, transform.cell * .026), 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let dots = 0;
    for (const trail of [fadingTrail, activeTrail]) if (trail) for (const sample of trail.samples) {
      const alpha = trailOpacity(sample.distance, trail.tail) * trail.alpha;
      if (alpha <= 0) continue;
      const point = transform.toCSS(sample.point);
      if (!containsPoint(clip, point)) continue;
      ctx.globalAlpha = alpha * .43; ctx.fillStyle = teal;
      ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(.9, Math.min(1.65, transform.cell * .045)), 0, Math.PI * 2); ctx.fill(); dots++;
    }
    canvas.dataset.trailDots = String(dots);
    drawPreview(transform.toCSS, transform.cell, teal, error);
    for (const arrow of state.level.arrows) {
      if (!state.activeArrowIds.has(arrow.id)) continue;
      const pending = state.pendingArrowId === arrow.id;
      const points = pending && exiting ? exiting : arrow.cells.map(transform.toCSS);
      const highlighted = selected === arrow.id || preview?.arrow.id === arrow.id || preview?.blockerId === arrow.id || blocked.includes(arrow.id) || pending;
      const color = blocked.includes(arrow.id) || preview?.blockerId === arrow.id ? error : highlighted ? teal : ink;
      if (highlighted) {
        ctx.globalAlpha = refined ? .08 : .12; ctx.lineWidth = refined ? lineStyle(transform.cell).stroke + 7 : Math.max(7, transform.cell * .32); ctx.strokeStyle = color; ctx.fillStyle = color;
        strokePath(ctx, points, arrow, transform.cell, refined);
      }
      ctx.globalAlpha = refined && pending ? 1 - exitingFraction * .12 : refined && blocked.includes(arrow.id) ? .9 + blockPulse * .1 : 1;
      ctx.lineWidth = refined ? lineStyle(transform.cell).stroke * (pending ? 1 - exitingFraction * .12 : 1) : Math.max(2.4, transform.cell * .115);
      ctx.strokeStyle = color; ctx.fillStyle = color;
      strokePath(ctx, points, arrow, transform.cell, refined);
    }
    if (bloom !== undefined) for (const particle of celebrationParticles(bloom, clip)) {
      ctx.globalAlpha = particle.alpha;
      ctx.fillStyle = [teal, ink, '#DC8B74', '#B6C6BE'][particle.color]!;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Bounded diagnostics for production QA; these are DOM metadata, never gameplay state.
    const paintMs = performance.now() - started;
    maxPaintMs = Math.max(maxPaintMs, paintMs);
    canvas.dataset.paintCount = String(++paintCount);
    canvas.dataset.lastPaintMs = paintMs.toFixed(3);
    canvas.dataset.maxPaintMs = maxPaintMs.toFixed(3);
    if (refined) {
      canvas.dataset.safeRect = JSON.stringify(space.safe);
      canvas.dataset.zoom = view.zoom.toFixed(3);
      canvas.dataset.cellSize = transform.cell.toFixed(3);
    }
  }
  function cancel() { animator.cancel(); effects.cancel(); clearTrails(); configuration.feedback?.cancel(); exiting = undefined; bloom = undefined; exitingFraction = 0; blockPulse = 0; clearInput(); clearTimeout(timer); blocked = []; selected = undefined; draw(); }
  function resize() {
    frame = 0;
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    clearInput(); selected = undefined; clearTrails();
    if (state?.phase === 'animating') { cancel(); interrupted(); }
    space = { width: rect.width, height: rect.height, columns: state?.level.width ?? 5, rows: state?.level.height ?? 5,
      ...(configuration.safeRect ? { safe: configuration.safeRect(rect.width, rect.height) } : {}) };
    view = boundView(view, space); gesture.configure(view, space);
    const backing = backingSize(space.width, space.height, window.devicePixelRatio);
    canvas.width = backing.width; canvas.height = backing.height;
    ctx.setTransform(backing.width / space.width, 0, 0, backing.height / space.height, 0, 0);
    draw();
  }
  function scheduleResize() { clearInput(); if (!disposed && !frame) frame = requestAnimationFrame(resize); }
  function watchDensity() {
    density?.removeEventListener('change', watchDensity);
    density = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    density.addEventListener('change', watchDensity); scheduleResize();
  }
  const observer = new ResizeObserver(scheduleResize); observer.observe(canvas);
  window.addEventListener('resize', scheduleResize, options); watchDensity();
  const local = (event: PointerEvent | WheelEvent): GridPoint => {
    const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  function hit(point: GridPoint) {
    if (!state) return;
    const transform = boardTransform(space, view);
    return hitArrow(point, state.level.arrows, state.activeArrowIds, transform.toCSS, Math.min(14, Math.max(8, transform.cell * .26)));
  }
  function changedView(next: View) { view = next; draw(); }
  function targetAt(point: GridPoint, pointerType: string) {
    if (!state) return { type: 'miss' } as const;
    if (refined) return touchTarget(point, state.level.arrows, state.activeArrowIds, boardTransform(space, view).toCSS, pointerType === 'mouse' ? 14 : 22, space.safe);
    const id = hit(point); return id ? { type: 'selected', id } as const : { type: 'miss' } as const;
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || state?.phase !== 'ready') return;
    if (space.safe && !containsPoint(space.safe, local(event))) {
      // A second finger in an empty overlay margin still cancels a hold and
      // joins the pinch. A first contact there remains ineligible for attempts.
      if (gesture.pointerIds().length) {
        canvas.setPointerCapture(event.pointerId); gesture.down(event.pointerId, local(event)); selected = undefined; draw();
      }
      return;
    }
    canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    const target = targetAt(local(event), event.pointerType);
    gesture.down(event.pointerId, local(event), target.type === 'selected' ? target.id : undefined, target.type === 'ambiguous');
    selected = undefined; draw();
  }, options);
  canvas.addEventListener('pointermove', event => { if (state?.phase === 'ready' && canvas.hasPointerCapture(event.pointerId)) changedView(gesture.move(event.pointerId, local(event))); }, options);
  canvas.addEventListener('pointerup', event => {
    const point = gesture.up(event.pointerId, local(event));
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    selected = undefined; draw();
    if (point && state?.phase === 'ready') {
      if (space.safe && !containsPoint(space.safe, point)) return;
      if (refined) {
        const target = targetAt(point, event.pointerType);
        if (target.type === 'ambiguous') {
          selected = undefined; blocked = [];
          changedView(zoomAt(view, 1.5, point, space)); gesture.configure(view, space);
          announce('Close paths. View magnified; tap the intended line again. No attempt was made.');
        } else if (target.type === 'selected') attempt(target.id);
      } else { const id = hit(point); if (id) attempt(id); }
    }
  }, options);
  canvas.addEventListener('pointercancel', () => { clearInput(); selected = undefined; draw(); }, options);
  canvas.addEventListener('lostpointercapture', event => {
    // pointerup already removed its pointer. Its expected release must not cancel
    // the remaining finger's pan after a pinch; unexpected capture loss cancels.
    if (gesture.has(event.pointerId)) { clearInput(); selected = undefined; draw(); }
  }, options);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (state?.phase !== 'ready') return;
    clearInput(); changedView(zoomAt(view, Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * .003), local(event), space));
    gesture.configure(view, space);
  }, { ...options, passive: false });
  // Pointerup owns all attempts. A browser's synthesized click/context menu cannot launch.
  canvas.addEventListener('click', event => event.preventDefault(), options);
  canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
  window.addEventListener('pointerdown', event => {
    if (gesture.pointerIds().length && event.target !== canvas) { clearInput(); selected = undefined; draw(); }
  }, { ...options, capture: true });
  function inactive() { const moving = state?.phase === 'animating'; cancel(); if (moving) interrupted(); }
  window.addEventListener('blur', inactive, options);
  window.addEventListener('pagehide', inactive, options);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) inactive(); }, options);
  canvas.addEventListener('keydown', event => {
    if (state?.phase !== 'ready') return;
    const arrows = state.level.arrows.filter(a => state!.activeArrowIds.has(a.id));
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      clearInput();
      const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const index = arrows.findIndex(a => a.id === selected);
      const arrow = arrows[index < 0 ? (delta > 0 ? 0 : arrows.length - 1) : (index + delta + arrows.length) % arrows.length];
      if (arrow) { selected = arrow.id; announce(`Arrow ${state.level.arrows.indexOf(arrow) + 1}, pointing ${arrow.direction}. Press P to preview, Enter to extract.`); draw(); }
    } else if (event.key.toLowerCase() === 'p' && selected) { event.preventDefault(); if (!event.repeat) showPreview(preview ? undefined : selected, true); }
    else if (event.key === 'Escape') { event.preventDefault(); clearInput(); draw(); }
    else if ((event.key === 'Enter' || event.key === ' ') && selected) { event.preventDefault(); if (!event.repeat) { showPreview(undefined); attempt(selected); } }
  }, options);
  return {
    setState(next) {
      const newLevel = next?.level !== state?.level;
      state = next;
      if (state?.phase !== 'ready') clearInput();
      if (newLevel) { cancel(); view = HOME_VIEW; selected = undefined; blocked = []; clearTimeout(timer); paintCount = 0; maxPaintMs = 0; resize(); }
      if (state?.phase !== 'animating') exiting = undefined;
      draw();
    },
    escape(id, complete) {
      const arrow = state?.level.arrows.find(a => a.id === id);
      if (!arrow || state?.pendingArrowId !== id) return;
      clearInput();
      selected = undefined;
      exitingFraction = 0;
      const transform = boardTransform(space, view);
      const extraction = extractionFor(arrow, transform.toCSS, space.width, space.height, transform.cell * .7 + 8);
      const duration = refined ? departureDuration(arrow.cells.length, extraction.travel, transform.cell, configuration.motionTiming) : extraction.duration;
      const isReduced = reduced();
      canvas.dataset.motionMode = isReduced ? 'reduced' : 'full';
      canvas.dataset.extractionDurationMs = duration.toFixed(3);
      canvas.dataset.extractionTravelPx = extraction.travel.toFixed(3);
      canvas.dataset.sourceLengthPx = extraction.length.toFixed(3);
      activeTrail = refined && !isReduced ? { samples: sourceTrail(arrow.cells), tail: 0, alpha: 1 } : undefined;
      configuration.feedback?.launch(duration, isReduced);
      let lastFrame: number | undefined, startedAt: number | undefined, maxGap = 0, frames = 0;
      animator.start(duration, fraction => {
        const time = performance.now();
        startedAt ??= time;
        canvas.dataset.extractionElapsedMs = (time - startedAt).toFixed(3);
        if (lastFrame !== undefined) maxGap = Math.max(maxGap, time - lastFrame);
        lastFrame = time;
        canvas.dataset.extractionFrames = String(++frames);
        canvas.dataset.extractionMaxGapMs = maxGap.toFixed(3);
        canvas.dataset.extractionFraction = fraction.toFixed(5);
        canvas.dataset.tailDistance = (fraction * extraction.travel / transform.cell).toFixed(5);
        if (activeTrail) activeTrail.tail = fraction * extraction.travel / transform.cell;
        exitingFraction = fraction; exiting = curveWindow(extraction.curve, fraction * extraction.travel, extraction.length); draw();
        canvas.dataset.movingTail = JSON.stringify(exiting[0]);
        canvas.dataset.movingHead = JSON.stringify(exiting.at(-1));
      },
        () => {
          exiting = undefined;
          if (activeTrail && !settling && !reduced()) {
            trailFade.cancel(); fadingTrail = activeTrail; activeTrail = undefined;
            trailFade.start(500, fraction => { if (fadingTrail) fadingTrail.alpha = 1 - fraction; draw(); }, () => { fadingTrail = undefined; draw(); });
          } else clearTrails();
          configuration.feedback?.complete(); complete();
        }, isReduced);
    },
    cancel, settle: () => { clearInput(); clearTrails(); configuration.feedback?.cancel(); settling = true; animator.finish(); settling = false; effects.finish(); draw(); },
    flash(ids) {
      configuration.feedback?.blocked();
      clearTimeout(timer); blocked = ids; draw();
      if (refined && !reduced()) effects.start(180, fraction => { blockPulse = Math.sin(Math.PI * fraction); draw(); }, () => { blocked = []; blockPulse = 0; draw(); });
      else timer = setTimeout(() => { blocked = []; draw(); }, reduced() ? 80 : 180);
    },
    resetView() { if (state?.phase === 'animating') return; clearInput(); view = HOME_VIEW; gesture.configure(view, space); draw(); },
    zoom(factor) {
      if (state?.phase !== 'ready') return;
      clearInput(); const rect = space.safe ?? { x: 0, y: 0, width: space.width, height: space.height };
      changedView(zoomAt(view, factor, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, space)); gesture.configure(view, space); return view.zoom;
    },
    celebrate() {
      if (state?.phase !== 'won') return;
      configuration.feedback?.victory();
      if (!refined || reduced()) return;
      effects.start(650, fraction => { bloom = fraction; draw(); }, () => { bloom = undefined; draw(); });
    },
    dispose() { disposed = true; cancel(); clearTimeout(timer); cancelAnimationFrame(frame); abort.abort(); observer.disconnect(); density?.removeEventListener('change', watchDensity); },
  };
}
