import './styles.css';
import './gameplay.css';
import { mountArtwork } from './graphics/render';
import { boardArtwork, homeArtwork } from './graphics/preview';
import { mountSettings } from './ui/settings';
import { mountGameBoard } from './graphics/game-board';
import { GameSession } from './gameplay/session';
import type { SessionSnapshot } from './gameplay/session';
import { getLevel } from './game/levels';
import { freshProgress, loadProgress } from './storage/progress';
import type { GameMode, GameState } from './game/types';
import { gameplayLayout } from './graphics/mobile-layout';
import type { ScreenRect } from './graphics/mobile-layout';
import { browserFeedback } from './feedback/game-feedback';
import { loadSettings } from './storage/settings';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root is missing.');

const mark = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 26V12a5 5 0 0 1 5-5h15M20 1l6 6-6 6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const gear = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 3-.7 2.1-2 .9-2.1-.4-1.5 2.6 1.4 1.7-.2 2.2L2.5 14l1.5 2.6 2.2-.3 1.8 1.2.7 2.1h3l.9-2.1 2-.9 2.1.4 1.5-2.6-1.4-1.7.2-2.2 1.4-1.9-1.5-2.6-2.2.3L13 5.1 12.3 3H9Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10.7" cy="11.3" r="3" stroke="currentColor" stroke-width="1.5"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const magnifyIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" stroke="currentColor" stroke-width="1.5"/><path d="m15 15 5 5M8 10.5h5M10.5 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const centerIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5"/></svg>';

app.innerHTML = `
  <div class="shell">
    <header class="app-header">
      <div class="wordmark">${mark}<span>FLOWLINE</span></div>
      <button id="settings-open" class="icon-button" type="button" aria-label="Settings" aria-haspopup="dialog">${gear}</button>
    </header>
    <main id="home-screen" class="home-screen" aria-labelledby="home-title">
      <div class="home-copy">
        <p class="eyebrow"><span class="tiny-line"></span> A LITTLE SPACE TO UNTANGLE</p>
        <h1 id="home-title" tabindex="-1">FLOWLINE<span class="title-dot">.</span></h1>
        <p class="subtitle">Unwind living lines.</p>
        <p class="introduction">A quiet moment. A different direction.<br />Find a little clarity, one line at a time.</p>
        <div class="play-options">
          <p id="home-progress" class="button-note">Level 1 · Your next quiet moment</p>
          <div class="mode-picker" role="group" aria-label="Game mode"><button type="button" data-mode="challenge" aria-pressed="true">Challenge <small>3 hearts</small></button><button type="button" data-mode="zen" aria-pressed="false">Zen <small>Unlimited retries</small></button></div>
          <button id="play-open" class="primary-button" type="button">Play ${arrow}</button>
          <button id="preview-open" class="text-button art-button" type="button">View art preview ${arrow}</button>
          <details class="practice-options"><summary>Explore a puzzle</summary><p>Practice a real generated puzzle. Your saved run and unlocks stay yours.</p><div><button type="button" data-practice="11">Level 11</button><button type="button" data-practice="41">Level 41</button><button type="button" data-practice="81">Level 81</button></div></details>
        </div>
      </div>
      <figure class="hero-art" aria-label="Original abstract arrow artwork">
        <div class="art-ring" aria-hidden="true"></div>
        <canvas id="home-canvas" aria-hidden="true"></canvas>
        <figcaption><span class="caption-line"></span> ROOM TO FIND YOUR WAY</figcaption>
      </figure>
    </main>
    <main id="preview-screen" class="preview-screen" aria-labelledby="preview-title" hidden>
      <div class="preview-heading">
        <button id="preview-back" class="text-button" type="button">${arrow}<span>Back</span></button>
        <span class="pill">DEVELOPMENT PREVIEW</span>
      </div>
      <div class="preview-layout">
        <div class="preview-copy">
          <p class="eyebrow">LINES, TAKING SHAPE</p>
          <h1 id="preview-title" tabindex="-1">Board Preview</h1>
          <p class="subtitle">Every turn has a direction.</p>
          <p class="introduction">A first look at Flowline's visual language: rounded paths, clear arrowheads, and room to breathe.</p>
          <div class="preview-notice"><span class="notice-icon" aria-hidden="true">i</span><p><strong>Artwork only</strong><br />These lines are non-interactive.<br />Choose Play on Home for a real puzzle.</p></div>
          <p class="legend"><span></span> Ink paths <span class="teal"></span> Teal accent</p>
        </div>
        <figure class="board-figure">
          <div class="board-frame"><canvas id="board-canvas" role="img" aria-label="Static board preview with ten straight and bent arrow paths, including two teal accent paths. No interactive puzzle.">Static arrow artwork. Choose Play on Home for a real puzzle.</canvas></div>
          <figcaption>STRAIGHT LINES. GENTLE TURNS. NEW POSSIBILITIES.</figcaption>
        </figure>
      </div>
    </main>
    <main id="game-screen" class="game-screen immersive-game" aria-labelledby="game-title" hidden>
      <h1 id="game-title" class="sr-only" tabindex="-1">Level 1</h1>
      <canvas id="game-canvas" tabindex="0" role="application" aria-label="Arrow puzzle" aria-describedby="board-help">Use the arrow keys to select a path and Enter to extract it.</canvas>
      <div id="top-hud" class="game-overlay immersive-hud">
        <button id="pause-open" class="level-pause" type="button" aria-label="Pause level 1" aria-haspopup="dialog">${pauseIcon}<span id="level-chip">Level 1</span></button>
        <div><p id="hearts" role="img" aria-label="3 hearts remaining" aria-live="polite">♥ ♥ ♥</p><p id="game-mode" class="zen-state" hidden>ZEN</p></div>
        <p id="difficulty"></p>
      </div>
      <div id="floating-controls" class="game-overlay floating-controls" role="group" aria-label="Puzzle view">
        <button id="zoom-in" class="float-control" type="button" aria-label="Magnify puzzle">${magnifyIcon}</button>
        <button id="center" class="float-control" type="button" aria-label="Reset view">${centerIcon}</button>
      </div>
      <div id="load-panel" class="load-panel" hidden><p id="load-message" role="status">Preparing your puzzle…</p><button id="load-retry" class="secondary-button" type="button" hidden>Try again</button></div>
      <p id="game-feedback" class="sr-only" role="status" aria-live="polite"></p><p id="game-toast" class="game-toast" hidden></p>
      <p id="escaped" class="sr-only" aria-live="polite"></p>
      <p id="board-help" class="sr-only">Tap a path to extract it. Hold to preview its route; release only dismisses. Pinch to zoom and drag to pan. Arrow keys select paths; P toggles preview, Escape dismisses, Enter or Space extracts. Open Pause for help and secondary controls.</p>
    </main>
    <p id="progress-notice" class="progress-notice" role="status" hidden></p>
    <footer class="app-footer"><span>Made for a quieter moment.</span><span class="phase-label">OFFLINE <span aria-hidden="true">/</span> NO RUSH</span></footer>
  </div>
  <dialog id="settings-dialog" aria-labelledby="settings-title" aria-describedby="settings-description">
    <div class="dialog-heading"><p class="eyebrow">MAKE YOURSELF AT HOME</p><button class="icon-button close-button" data-close type="button" aria-label="Close settings"><span aria-hidden="true">×</span></button></div>
    <h2 id="settings-title">Settings</h2>
    <p id="settings-description">Small preferences for your quiet space.</p>
    <div class="settings-options">
      <label class="setting-row"><span><strong>Sound effects</strong><small>Quiet plucks, airy movement and a gentle finish.</small></span><input type="checkbox" data-setting="sound" role="switch" aria-label="Sound effects" /><span class="switch-track" aria-hidden="true"></span></label>
      <label class="setting-row"><span><strong>Haptics</strong><small>Brief vibration on browsers and devices that support it.</small></span><input type="checkbox" data-setting="haptics" role="switch" aria-label="Haptics" /><span class="switch-track" aria-hidden="true"></span></label>
      <label class="setting-row"><span><strong>Reduced motion</strong><small id="motion-preference-note">Settle arrows immediately. System preference is also respected.</small></span><input type="checkbox" data-setting="reducedMotion" role="switch" aria-label="Reduced motion" /><span class="switch-track" aria-hidden="true"></span></label>
    </div>
    <p class="settings-note">Original, subtle feedback. Sound and vibration are optional and independent; unavailable device features stay quiet.</p>
    <p class="save-status" role="status" aria-live="polite">Preferences are saved on this device.</p>
  </dialog>
  <dialog id="pause-dialog" class="pause-sheet" aria-labelledby="pause-title"><div class="pause-heading"><h2 id="pause-title">A quiet pause.</h2><button id="pause-close" class="icon-button" type="button" aria-label="Resume game">×</button></div><p id="pause-meta" class="pause-meta"></p><button id="resume" class="primary-button" type="button">Keep flowing ${arrow}</button><div class="pause-actions"><button id="restart" class="secondary-button" type="button">Restart puzzle</button><button id="pause-settings" class="secondary-button" type="button">Settings</button><button id="game-back" class="secondary-button" type="button">Home</button><button id="pause-help-open" class="secondary-button" type="button">How to play</button></div><details id="pause-help" class="pause-help"><summary>View &amp; controls</summary><p id="concept"></p><p>Tap the line whose head has a clear route. Hold a line to preview; releasing a hold makes no attempt. Clear a blocking path first. Challenge gives you three hearts; Zen lets you try freely.</p><p>Pinch to zoom, drag to pan. The magnifier enlarges your view; Center restores fit. Keyboard: arrow keys select a path, P toggles its route preview, Escape dismisses it, Enter or Space extracts it.</p><div class="pause-view"><button id="zoom-out" class="secondary-button" type="button">Zoom out</button><button id="pause-zoom-in" class="secondary-button" type="button">Zoom in</button><button id="pause-center" class="secondary-button" type="button">Center</button></div><p>Switching mode restarts this puzzle.</p><div class="pause-mode"><button id="pause-zen" class="secondary-button" type="button">Restart in Zen</button><button id="pause-challenge" class="secondary-button" type="button">Restart in Challenge</button></div></details><p id="pause-save-notice" class="save-status" role="status"></p></dialog>
  <dialog id="result-dialog" class="game-result" aria-labelledby="result-title" aria-describedby="result-copy"><p class="eyebrow" id="result-eyebrow">ROOM TO BREATHE</p><div class="result-symbol" aria-hidden="true">↗</div><h2 id="result-title">Beautifully untangled.</h2><p id="result-copy"></p><div class="result-actions"><button id="next-level" class="primary-button" type="button">Next level ${arrow}</button><button id="result-restart" class="secondary-button" type="button">Replay</button><button id="result-zen" class="secondary-button" type="button" hidden>Try in Zen</button><button id="result-home" class="text-button" type="button">Home</button></div></dialog>
`;

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

const home = required<HTMLElement>('#home-screen');
const preview = required<HTMLElement>('#preview-screen');
const previewButton = required<HTMLButtonElement>('#preview-open');
const backButton = required<HTMLButtonElement>('#preview-back');
const controller = new AbortController();
const options = { signal: controller.signal };
const game = required<HTMLElement>('#game-screen');
const play = required<HTMLButtonElement>('#play-open');
const resultDialog = required<HTMLDialogElement>('#result-dialog');
const pauseDialog = required<HTMLDialogElement>('#pause-dialog');
const feedback = required<HTMLElement>('#game-feedback');
const toast = required<HTMLElement>('#game-toast');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let isPractice = false;
let lastRendered: GameState | undefined;
let lastNotice = '';
let route: 'home' | 'preview' | 'game' = 'home';
let reducedMotion = false;
let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Session-only play remains available. */ }
const saved = loadProgress(storage);
const feedbackEffects = browserFeedback(loadSettings(storage), status => {
  const canvas = required<HTMLCanvasElement>('#game-canvas');
  canvas.dataset.audioState = status.state; canvas.dataset.audioEvent = status.event; canvas.dataset.audioVoices = String(status.voices);
});
function clearTransient() { clearTimeout(toastTimer); toast.hidden = true; feedback.textContent = ''; }

function announce(message: string, visible = false, blocked = false) {
  feedback.textContent = message;
  if (!visible) return;
  clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false; toast.dataset.blocked = String(blocked);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 1900);
}
function overlayRect(element: HTMLElement, rect: ScreenRect) {
  element.style.left = `${rect.x}px`; element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`; element.style.height = `${rect.height}px`;
}
function safeRect(width: number, height: number): ScreenRect {
  const css = getComputedStyle(game);
  const value = (side: string) => Number.parseFloat(css.getPropertyValue(`--safe-${side}`)) || 0;
  const layout = gameplayLayout(width, height, { top: value('top'), right: value('right'), bottom: value('bottom'), left: value('left') });
  game.dataset.landscape = String(layout.landscape);
  overlayRect(required<HTMLElement>('#top-hud'), layout.hud);
  overlayRect(required<HTMLElement>('#floating-controls'), layout.controls);
  return layout.safe;
}

function render(snapshot: SessionSnapshot) {
  const { state, progress } = snapshot;
  const homeProgress = regularSession.current.progress;
  required<HTMLElement>('#home-progress').textContent = `Level ${homeProgress.run?.number ?? homeProgress.highestUnlocked} · Unlocked through ${homeProgress.highestUnlocked}`;
  play.firstChild!.textContent = homeProgress.run ? 'Continue ' : 'Play ';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === homeProgress.mode));
  const notice = required<HTMLElement>('#progress-notice'); notice.textContent = snapshot.notice; notice.hidden = !snapshot.notice;
  required<HTMLElement>('#game-title').textContent = `Level ${snapshot.number}`;
  required<HTMLElement>('#level-chip').textContent = `Level ${snapshot.number}`;
  required<HTMLElement>('#pause-open').setAttribute('aria-label', `Pause level ${snapshot.number}`);
  required<HTMLElement>('#load-panel').hidden = !snapshot.loading && !snapshot.error;
  required<HTMLElement>('#load-message').textContent = snapshot.error || 'Preparing your puzzle…';
  required<HTMLElement>('#load-retry').hidden = !snapshot.error;
  required<HTMLElement>('#difficulty').textContent = snapshot.level?.analysis.tier ?? '';
  required<HTMLElement>('#concept').textContent = snapshot.level?.concept ?? 'Find the clear head lanes. Each exit opens another possibility.';
  board.setState(state);
  required<HTMLElement>('#pause-meta').textContent = `Level ${snapshot.number} · ${state?.mode ?? progress.mode} · ${snapshot.level?.analysis.tier ?? 'preparing'}${isPractice ? ' · Practice, not saved' : ''}`;
  required<HTMLElement>('#pause-save-notice').textContent = isPractice ? 'Practice leaves your saved run and unlocked levels unchanged.' : snapshot.notice;
  if (snapshot.notice && snapshot.notice !== lastNotice && !isPractice) announce(snapshot.notice, true);
  lastNotice = snapshot.notice;
  required<HTMLButtonElement>('#restart').disabled = !state;
  for (const id of ['#center', '#zoom-in', '#zoom-out']) required<HTMLButtonElement>(id).disabled = !state || state.phase === 'animating';
  required<HTMLCanvasElement>('#game-canvas').setAttribute('aria-busy', String(snapshot.loading));
  if (!state) {
    required<HTMLElement>('#game-mode').textContent = progress.mode.toUpperCase();
    required<HTMLElement>('#hearts').hidden = true;
    required<HTMLElement>('#escaped').textContent = snapshot.loading ? 'Preparing…' : '';
    required<HTMLCanvasElement>('#game-canvas').setAttribute('aria-label', snapshot.loading ? 'Preparing arrow puzzle' : 'Puzzle unavailable');
    return;
  }
  if (route !== 'game') return;
  required<HTMLElement>('#game-mode').hidden = state.mode !== 'zen';
  required<HTMLElement>('#game-mode').textContent = 'ZEN';
  const hearts = required<HTMLElement>('#hearts'); hearts.hidden = state.mode === 'zen';
  hearts.textContent = Array.from({ length: 3 }, (_, i) => i < state.hearts ? '♥' : '♡').join(' ');
  hearts.setAttribute('aria-label', `${state.hearts} hearts remaining`);
  required<HTMLElement>('#escaped').textContent = `${state.level.arrows.length - state.activeArrowIds.size} / ${state.level.arrows.length} escaped`;
  required<HTMLCanvasElement>('#game-canvas').setAttribute('aria-label', `Level ${snapshot.number} arrow puzzle. ${state.activeArrowIds.size} paths remaining.`);
  const previous = lastRendered; lastRendered = state;
  const canvas = required<HTMLCanvasElement>('#game-canvas');
  canvas.dataset.levelId = state.level.id;
  canvas.dataset.arrowCount = String(state.level.arrows.length);
  canvas.dataset.density = String(snapshot.level?.analysis.metrics.density ?? 0);
  canvas.dataset.boardSize = `${state.level.width}x${state.level.height}`;
  Object.assign(canvas.dataset, { phase: state.phase, attempts: String(state.moves), hearts: String(state.hearts), remaining: String(state.activeArrowIds.size) });
  if (state.phase === 'won' || state.phase === 'lost') {
    clearTransient();
    const won = state.phase === 'won';
    required<HTMLElement>('#result-eyebrow').textContent = won ? 'ROOM TO BREATHE' : 'A FRESH PERSPECTIVE';
    required<HTMLElement>('#result-title').textContent = won ? 'Beautifully untangled.' : 'Take another look.';
    required<HTMLElement>('#result-copy').textContent = won ? `Level ${snapshot.number} is clear. ${isPractice ? 'A little space, just for you.' : 'Your next quiet moment awaits.'}` : 'A fresh start can open a different route. Try again, or find your pace in Zen.';
    required<HTMLButtonElement>('#next-level').hidden = !won || snapshot.number === 0xFFFF_FFFF;
    required<HTMLButtonElement>('#result-restart').textContent = won ? 'Replay' : 'Restart';
    required<HTMLButtonElement>('#result-zen').hidden = won;
    if (!resultDialog.open && !pauseDialog.open) resultDialog.showModal();
    if (won && previous?.phase === 'animating') board.celebrate();
  }
}

const board = mountGameBoard(required<HTMLCanvasElement>('#game-canvas'), id => {
  const attempt = session.attempt(id);
  if (!attempt || attempt.result.type === 'ignored') return;
  if (attempt.result.type === 'blocked') {
    const state = attempt.result.state;
    announce(`A line blocks this route. ${state.mode === 'zen' ? 'Try another path.' : `${state.hearts} hearts remaining.`}`, state.phase === 'ready', true);
    board.flash([id, attempt.result.blockerId]);
  } else {
    announce('A clear route.');
    board.escape(id, () => { session.complete(attempt.token); announce('Path clear.'); });
  }
}, () => session.interrupt(), () => reducedMotion, message => announce(message, message.startsWith('Close paths')), { safeRect, feedback: feedbackEffects });

// A separate task paints loading UI before bounded generation; never generate inside input/RAF.
const levelProvider = (number: number) => new Promise<ReturnType<typeof getLevel>>((resolve, reject) => {
  setTimeout(() => { try { resolve(getLevel(number)); } catch (error) { reject(error); } }, 30);
});
const regularSession = new GameSession(saved.progress, storage, render, levelProvider, saved.notice);
let session = regularSession;
render(session.current);

function navigate(next: typeof route) {
  board.cancel(); session.interrupt(); resultDialog.close(); pauseDialog.close(); route = next;
  clearTimeout(toastTimer); toast.hidden = true; feedback.textContent = ''; lastRendered = undefined;
  document.body.dataset.gameplay = String(next === 'game');
  if (next === 'home' && isPractice) { session = regularSession; isPractice = false; }
  home.hidden = next !== 'home'; preview.hidden = next !== 'preview'; game.hidden = next !== 'game';
  document.title = next === 'preview' ? 'Board Preview — FLOWLINE' : next === 'game' ? 'Play — FLOWLINE' : 'FLOWLINE — Unwind living lines.';
  if (next === 'home') play.focus();
  else required<HTMLElement>(next === 'game' ? '#game-title' : '#preview-title').focus();
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (next === 'home') render(regularSession.current);
}

function showPreview(show: boolean) {
  navigate(show ? 'preview' : 'home');
  if (!show) previewButton.focus();
}

previewButton.addEventListener('click', () => showPreview(true), { signal: controller.signal });
backButton.addEventListener('click', () => showPreview(false), { signal: controller.signal });
play.addEventListener('click', () => { session = regularSession; isPractice = false; navigate('game'); void session.load(session.current.progress.run?.number ?? session.current.progress.highestUnlocked); }, options);
required<HTMLButtonElement>('#game-back').addEventListener('click', () => navigate('home'), options);
required<HTMLButtonElement>('#load-retry').addEventListener('click', () => { void session.load(); }, options);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) button.addEventListener('click', () => regularSession.selectMode(button.dataset.mode as GameMode), options);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-practice]')) button.addEventListener('click', () => {
  navigate('game'); isPractice = true;
  session = new GameSession(freshProgress(), undefined, render, levelProvider, '', true);
  void session.load(Number(button.dataset.practice), regularSession.current.progress.mode, false);
}, options);
function restart(mode?: GameMode) { clearTransient(); board.cancel(); resultDialog.close(); pauseDialog.close(); session.restart(mode); board.resetView(); announce('A fresh start.'); required<HTMLCanvasElement>('#game-canvas').focus({ preventScroll: true }); }
required<HTMLButtonElement>('#restart').addEventListener('click', () => restart(), options);
required<HTMLButtonElement>('#result-restart').addEventListener('click', () => restart(), options);
required<HTMLButtonElement>('#result-zen').addEventListener('click', () => restart('zen'), options);
required<HTMLButtonElement>('#result-home').addEventListener('click', () => navigate('home'), options);
required<HTMLButtonElement>('#next-level').addEventListener('click', () => { clearTransient(); board.cancel(); resultDialog.close(); feedback.textContent = 'Tap an arrow with a clear head lane.'; void session.next(); }, options);
resultDialog.addEventListener('cancel', event => event.preventDefault(), options);
required<HTMLButtonElement>('#center').addEventListener('click', () => { board.resetView(); announce('View centered.'); }, options);
required<HTMLButtonElement>('#zoom-in').addEventListener('click', () => { const zoom = board.zoom(1.5); if (zoom) announce(`View magnified to ${zoom.toFixed(1)} times. Drag to move; Center restores fit.`); }, options);
required<HTMLButtonElement>('#zoom-out').addEventListener('click', () => board.zoom(1 / 1.35), options);
const interrupt = () => { board.cancel(); session.interrupt(); clearTransient(); };
function openPause() { interrupt(); pauseDialog.showModal(); required<HTMLButtonElement>('#resume').focus(); }
required<HTMLButtonElement>('#pause-open').addEventListener('click', openPause, options);
for (const id of ['#resume', '#pause-close']) required<HTMLButtonElement>(id).addEventListener('click', () => { pauseDialog.close(); render(session.current); }, options);
pauseDialog.addEventListener('close', () => { if (route === 'game' && !required<HTMLDialogElement>('#settings-dialog').open && !resultDialog.open) required<HTMLCanvasElement>('#game-canvas').focus({ preventScroll: true }); }, options);
required<HTMLButtonElement>('#pause-settings').addEventListener('click', () => { pauseDialog.close(); required<HTMLButtonElement>('#settings-open').click(); }, options);
required<HTMLButtonElement>('#pause-help-open').addEventListener('click', () => { required<HTMLDetailsElement>('#pause-help').open = true; required<HTMLDetailsElement>('#pause-help').scrollIntoView({ block: 'nearest' }); }, options);
required<HTMLButtonElement>('#pause-zoom-in').addEventListener('click', () => board.zoom(1.5), options);
required<HTMLButtonElement>('#pause-center').addEventListener('click', () => board.resetView(), options);
required<HTMLButtonElement>('#pause-zen').addEventListener('click', () => restart('zen'), options);
required<HTMLButtonElement>('#pause-challenge').addEventListener('click', () => restart('challenge'), options);
window.addEventListener('pagehide', interrupt, options);
window.addEventListener('blur', interrupt, options);
document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); }, options);

const disposers = [
  mountArtwork(required<HTMLCanvasElement>('#home-canvas'), homeArtwork, false),
  mountArtwork(required<HTMLCanvasElement>('#board-canvas'), boardArtwork, true),
  mountSettings(required<HTMLDialogElement>('#settings-dialog'), required<HTMLButtonElement>('#settings-open'), reduced => { reducedMotion = reduced; if (reduced) board.settle(); }, interrupt,
    () => { if (route === 'game') openPause(); else required<HTMLButtonElement>('#settings-open').focus(); }, settings => feedbackEffects.configure(settings)),
  () => { clearTimeout(toastTimer); board.dispose(); feedbackEffects.dispose(); session.interrupt(); },
];

// Vite HMR remounts cleanly; no orphaned observers, events, or animation frames.
if (import.meta.hot) import.meta.hot.dispose(() => {
  controller.abort();
  for (const dispose of disposers) dispose();
});
