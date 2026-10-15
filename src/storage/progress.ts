import { attemptMove, completeEscape, createGameState } from '../game/state';
import type { GameMode, GameState, Level } from '../game/types';
import type { SettingsStorage } from './settings';

export const PROGRESS_KEY = 'flowline.progress.v1';
export const MAX_HISTORY = 256;
export const MAX_REPLAY_ATTEMPTS = 4096;
export interface AttemptRecord { readonly arrowId: string; readonly outcome: 'blocked' | 'exiting'; readonly count: number }
export interface SavedRun { readonly number: number; readonly identity: string; readonly mode: GameMode; readonly history: readonly AttemptRecord[] }
export interface Progress { readonly version: 1; readonly highestUnlocked: number; readonly mode: GameMode; readonly run: SavedRun | null }
export interface LoadedProgress { readonly progress: Progress; readonly notice: string }
export const freshProgress = (): Progress => ({ version: 1, highestUnlocked: 1, mode: 'challenge', run: null });
export const isLevelNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 0xFFFF_FFFF;
const isMode = (value: unknown): value is GameMode => value === 'challenge' || value === 'zen';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Identity includes geometry as well as recipe/id/seed; changed authored levels cannot replay stale attempts. */
export function levelIdentity(level: Level): string {
  const geometry = JSON.stringify([level.width, level.height, level.arrows.map(a => [a.id, a.direction, a.cells])]);
  let hash = 2166136261;
  for (let i = 0; i < geometry.length; i++) hash = Math.imul(hash ^ geometry.charCodeAt(i), 16777619);
  return `flowline-level-v1:${level.id}:${level.seed ?? 'authored'}:${(hash >>> 0).toString(16)}`;
}

export function decodeProgress(raw: string | null): LoadedProgress {
  const fallback = { progress: freshProgress(), notice: '' };
  if (!raw) return fallback;
  try {
    if (raw.length > 100_000) throw new Error('Oversized save');
    const value: unknown = JSON.parse(raw);
    if (!object(value)) throw new Error('Invalid save');
    // Independent progress survives an unsupported run/schema, when its fields are valid.
    const highestUnlocked = isLevelNumber(value.highestUnlocked) ? value.highestUnlocked : 1;
    const mode = isMode(value.mode) ? value.mode : 'challenge';
    const progress: Progress = { version: 1, highestUnlocked, mode, run: null };
    const invalid = (): LoadedProgress => ({ progress, notice: 'Saved puzzle could not be restored. Your unlocked levels are retained.' });
    if (value.version !== 1) return invalid();
    if (value.run === null) return { progress, notice: '' };
    const run = value.run;
    if (!object(run) || !isLevelNumber(run.number) || run.number > highestUnlocked || !isMode(run.mode)
      || typeof run.identity !== 'string' || run.identity.length > 500 || !Array.isArray(run.history) || run.history.length > MAX_HISTORY) return invalid();
    const history: AttemptRecord[] = [];
    let attempts = 0;
    for (const record of run.history) {
      if (!object(record) || typeof record.arrowId !== 'string' || !record.arrowId || record.arrowId.length > 250
        || (record.outcome !== 'blocked' && record.outcome !== 'exiting') || !Number.isInteger(record.count)
        || typeof record.count !== 'number' || record.count < 1 || (record.outcome === 'exiting' && record.count !== 1)) return invalid();
      attempts += record.count;
      if (attempts > MAX_REPLAY_ATTEMPTS) return invalid();
      history.push({ arrowId: record.arrowId, outcome: record.outcome, count: record.count });
    }
    return { progress: { ...progress, run: { number: run.number, mode: run.mode, identity: run.identity, history } }, notice: '' };
  } catch { return { ...fallback, notice: 'Saved progress is unreadable. Starting a fresh puzzle.' }; }
}
export function loadProgress(storage: SettingsStorage | undefined): LoadedProgress {
  try { return storage ? decodeProgress(storage.getItem(PROGRESS_KEY)) : { progress: freshProgress(), notice: 'Progress will last only for this session. Device storage is unavailable.' }; }
  catch { return { progress: freshProgress(), notice: 'Progress will last only for this session. Device storage is unavailable.' }; }
}
export function saveProgress(storage: SettingsStorage | undefined, progress: Progress): boolean {
  try { if (!storage) return false; storage.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

export function replayRun(level: Level, run: SavedRun): GameState | undefined {
  if (run.identity !== levelIdentity(level)) return undefined;
  let state = createGameState(level, run.mode);
  let attempts = 0;
  if (run.history.length > MAX_HISTORY) return undefined;
  for (const record of run.history) {
    attempts += record.count;
    if (!Number.isInteger(record.count) || record.count < 1 || attempts > MAX_REPLAY_ATTEMPTS || (record.outcome === 'exiting' && record.count !== 1)) return undefined;
    for (let i = 0; i < record.count; i++) {
      const result = attemptMove(state, record.arrowId);
      if (result.type !== record.outcome) return undefined;
      state = result.type === 'exiting' ? completeEscape(result.state) : result.state;
    }
  }
  return state;
}

/** Consecutive Zen blocks compress; both encoded events and replay CPU have hard limits. */
export function appendAttempt(history: readonly AttemptRecord[], arrowId: string, outcome: AttemptRecord['outcome']): readonly AttemptRecord[] | undefined {
  if (history.reduce((sum, r) => sum + r.count, 0) >= MAX_REPLAY_ATTEMPTS) return undefined;
  const last = history.at(-1);
  if (outcome === 'blocked' && last?.outcome === outcome && last.arrowId === arrowId)
    return [...history.slice(0, -1), { ...last, count: last.count + 1 }];
  return history.length < MAX_HISTORY ? [...history, { arrowId, outcome, count: 1 }] : undefined;
}
