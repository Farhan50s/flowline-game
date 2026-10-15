import { getLevel } from '../game/levels';
import type { LevelResult } from '../game/levels';
import { attemptMove, completeEscape, createGameState, restartLevel } from '../game/state';
import type { MoveResult } from '../game/state';
import type { GameMode, GameState } from '../game/types';
import { appendAttempt, levelIdentity, replayRun, saveProgress } from '../storage/progress';
import type { AttemptRecord, Progress } from '../storage/progress';
import type { SettingsStorage } from '../storage/settings';

export type LevelProvider = (number: number) => LevelResult | Promise<LevelResult>;
export interface SessionSnapshot {
  readonly number: number; readonly state: GameState | undefined; readonly level: Extract<LevelResult, { ok: true }> | undefined;
  readonly loading: boolean; readonly error: string; readonly notice: string; readonly progress: Progress;
}
/** Orchestration only. The immutable engine is the sole owner of gameplay transitions. */
export class GameSession {
  private generation = 0;
  private escape = 0;
  private committed: GameState | undefined;
  private history: readonly AttemptRecord[] = [];
  private historyAvailable = true;
  private snapshot: SessionSnapshot;
  constructor(progress: Progress, private readonly storage: SettingsStorage | undefined,
    private readonly changed: (snapshot: SessionSnapshot) => void, private readonly provider: LevelProvider = getLevel, notice = '',
    private readonly practice = false) {
    this.snapshot = { number: progress.run?.number ?? progress.highestUnlocked, state: undefined, level: undefined,
      loading: false, error: '', notice, progress };
  }
  get current() { return this.snapshot; }
  private emit(patch: Partial<SessionSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.changed(this.snapshot); }
  private persist() {
    if (this.practice) return;
    const state = this.committed;
    const run = state ? (this.historyAvailable ? { number: this.snapshot.number, identity: levelIdentity(state.level), mode: state.mode, history: this.history } : null) : this.snapshot.progress.run;
    const progress: Progress = { ...this.snapshot.progress, run };
    const saved = saveProgress(this.storage, progress);
    this.emit({ progress, ...(!saved ? { notice: 'Progress cannot be saved on this device. You can keep playing in this session.' } : {}) });
  }
  async load(number = this.snapshot.number, mode = this.snapshot.progress.mode, restore = true) {
    this.interrupt();
    const generation = ++this.generation;
    this.committed = undefined;
    this.emit({ number, loading: true, error: '', state: undefined, level: undefined });
    try {
      const result = await this.provider(number);
      if (generation !== this.generation) return;
      if (!result.ok) { this.emit({ loading: false, error: `This puzzle could not be prepared. ${result.message}` }); return; }
      const run = restore && this.snapshot.progress.run?.number === number && this.snapshot.progress.run.mode === mode ? this.snapshot.progress.run : null;
      const restored = run ? replayRun(result.level, run) : undefined;
      const state = restored ?? createGameState(result.level, mode);
      this.history = restored && run ? run.history : [];
      this.historyAvailable = true;
      this.committed = state;
      this.emit({ state, level: result, loading: false, progress: { ...this.snapshot.progress, mode },
        ...(run && !restored ? { notice: 'Saved puzzle no longer matches this level. Starting it again; unlocked levels are retained.' } : {}) });
      this.unlock();
      this.persist();
    } catch {
      if (generation === this.generation) this.emit({ loading: false, error: 'This puzzle could not be prepared. Please try again.' });
    }
  }
  attempt(id: string): { result: MoveResult; token: number } | undefined {
    const state = this.snapshot.state;
    if (!state || this.snapshot.loading) return undefined;
    const result = attemptMove(state, id);
    if (result.type === 'ignored') return { result, token: this.escape };
    const token = ++this.escape;
    this.emit({ state: result.state });
    if (result.type === 'blocked') { this.committed = result.state; this.record(id, 'blocked'); this.persist(); }
    return { result, token };
  }
  complete(token: number) {
    const state = this.snapshot.state;
    if (token !== this.escape || state?.phase !== 'animating' || !state.pendingArrowId) return;
    this.escape++;
    const id = state.pendingArrowId;
    const completed = completeEscape(state);
    this.committed = completed;
    this.record(id, 'exiting');
    this.emit({ state: completed });
    this.unlock();
    this.persist();
  }
  private record(id: string, outcome: AttemptRecord['outcome']) {
    if (!this.historyAvailable) return;
    const next = appendAttempt(this.history, id, outcome);
    if (next) this.history = next;
    else {
      this.historyAvailable = false;
      this.history = [];
      this.emit({ notice: 'This unusually long run has reached the save limit. Unlocked levels are saved; restart to resume saving this puzzle.' });
    }
  }
  private unlock() {
    if (!this.practice && this.committed?.phase === 'won') this.emit({ progress: { ...this.snapshot.progress,
      highestUnlocked: Math.max(this.snapshot.progress.highestUnlocked, Math.min(0xFFFF_FFFF, this.snapshot.number + 1)) } });
  }
  interrupt() {
    this.generation++; this.escape++;
    if (this.snapshot.state?.phase === 'animating') this.emit({ state: this.committed });
    if (this.snapshot.loading) this.emit({ loading: false, error: 'Puzzle preparation was paused. Please try again.' });
  }
  restart(mode?: GameMode) {
    this.interrupt();
    const state = this.snapshot.state;
    if (!state) return;
    const restarted = mode ? createGameState(state.level, mode) : restartLevel(state);
    this.history = []; this.historyAvailable = true; this.committed = restarted;
    this.emit({ state: restarted, notice: '', progress: { ...this.snapshot.progress, mode: restarted.mode } });
    this.unlock(); this.persist();
  }
  selectMode(mode: GameMode) {
    this.emit({ progress: { ...this.snapshot.progress, mode } });
    this.persist();
  }
  next(): Promise<void> | undefined {
    if (this.snapshot.state?.phase !== 'won' || this.snapshot.number >= 0xFFFF_FFFF) return undefined;
    return this.load(this.snapshot.number + 1, this.snapshot.progress.mode, false);
  }
}
