import { describe, expect, it } from 'vitest';
import { appendAttempt, decodeProgress, freshProgress, levelIdentity, loadProgress, MAX_HISTORY, MAX_REPLAY_ATTEMPTS, PROGRESS_KEY, replayRun, saveProgress } from '../storage/progress';
import type { Progress, SavedRun } from '../storage/progress';
import { getLevel } from '../game/levels';
import { attemptMove, completeEscape, createGameState } from '../game/state';
import { SETTINGS_KEY } from '../storage/settings';
import type { SettingsStorage } from '../storage/settings';
import { memoryStorage } from './fixtures/storage';

const level = (n: number) => { const r = getLevel(n); if (!r.ok) throw new Error(r.message); return r.level; };
const board = level(2);
const lead = board.arrows[0]!.id, gate = board.arrows[1]!.id;
const run: SavedRun = { number: 2, identity: levelIdentity(board), mode: 'challenge', history: [{ arrowId: lead, outcome: 'blocked', count: 1 }, { arrowId: gate, outcome: 'exiting', count: 1 }] };
const progress: Progress = { version: 1, highestUnlocked: 3, mode: 'challenge', run };
const encode = (p: unknown) => JSON.stringify(p);
describe('defensive offline progression', () => {
  it('round-trips by replaying actual outcomes and keeps settings in a separate key', () => {
    const storage = memoryStorage(); storage.setItem(SETTINGS_KEY, 'settings untouched');
    expect(saveProgress(storage, progress)).toBe(true);
    const decoded = loadProgress(storage); expect(decoded.progress).toEqual(progress);
    const restored = replayRun(board, decoded.progress.run!);
    const attempted = attemptMove(createGameState(board, 'challenge'), lead);
    const expected = completeEscape(attemptMove(attempted.state, gate).state);
    expect(restored).toEqual(expected); expect(restored?.activeArrowIds.size).toBe(1);
    expect(storage.values.get(SETTINGS_KEY)).toBe('settings untouched');
    const raw = storage.values.get(PROGRESS_KEY)!;
    expect(raw).not.toContain('activeArrowIds'); expect(raw).not.toContain('cells'); expect(raw).not.toContain('pendingArrowId');
  });
  it.each([null, '', '{', 'null', '42', '[]'])('safely defaults unreadable/empty input %s', raw => {
    expect(decodeProgress(raw).progress).toEqual(freshProgress());
  });
  it('retains independent unlocks/mode from an unknown schema', () => {
    expect(decodeProgress(encode({ ...progress, version: 99 })).progress).toEqual({ version: 1, highestUnlocked: 3, mode: 'challenge', run: null });
  });
  it.each([
    { number: 4 }, { number: 0 }, { number: 2.1 }, { mode: 'classic' }, { identity: 17 }, { history: {} },
    { history: [{ arrowId: lead, outcome: 'blocked', count: -1 }] },
    { history: [{ arrowId: lead, outcome: 'blocked', count: 1.5 }] },
    { history: [{ arrowId: lead, outcome: 'animating', count: 1 }] },
    { history: [{ arrowId: '', outcome: 'blocked', count: 1 }] },
    { history: [{ arrowId: lead, outcome: 'exiting', count: 2 }] },
    { history: [{ arrowId: lead, outcome: 'blocked', count: MAX_REPLAY_ATTEMPTS + 1 }] },
    { history: Array.from({ length: MAX_HISTORY + 1 }, () => ({ arrowId: lead, outcome: 'blocked', count: 1 })) },
  ])('rejects malformed run fields %j without erasing unlocks', patch => {
    const decoded = decodeProgress(encode({ ...progress, run: { ...run, ...patch } }));
    expect(decoded.progress.highestUnlocked).toBe(3); expect(decoded.progress.run).toBeNull(); expect(decoded.notice).toBeTruthy();
  });
  it('falls back independently for invalid level/mode fields and rejects huge payloads', () => {
    expect(decodeProgress(encode({ version: 1, highestUnlocked: -2, mode: 'wrong', run: null })).progress).toEqual(freshProgress());
    expect(decodeProgress(' '.repeat(100001)).notice).toBeTruthy();
  });
  it('rejects stale ID, seed, authored geometry and procedural recipes', () => {
    expect(replayRun({ ...board, id: 'new-version' }, run)).toBeUndefined();
    expect(replayRun({ ...board, seed: 123 }, run)).toBeUndefined();
    const altered = { ...board, arrows: [board.arrows[1]!] };
    expect(replayRun(altered, run)).toBeUndefined();
    const procedural = level(11);
    expect(levelIdentity(procedural)).toContain('procedural-v1');
    expect(replayRun(procedural, { ...run, identity: 'procedural-v0' })).toBeUndefined();
  });
  it.each([
    [{ arrowId: lead, outcome: 'exiting' as const, count: 1 }],
    [{ arrowId: gate, outcome: 'blocked' as const, count: 1 }],
    [{ arrowId: 'absent', outcome: 'blocked' as const, count: 1 }],
    [{ arrowId: gate, outcome: 'exiting' as const, count: 1 }, { arrowId: gate, outcome: 'exiting' as const, count: 1 }],
    [{ arrowId: lead, outcome: 'blocked' as const, count: 4 }],
  ].map(history => ({ history })))('rejects illegal or inconsistent engine histories %j', ({ history }) => { expect(replayRun(board, { ...run, history })).toBeUndefined(); });
  it('restores won/lost and repeated Zen blocks using the same engine', () => {
    const won = replayRun(board, { ...run, history: [{ arrowId: gate, outcome: 'exiting', count: 1 }, { arrowId: lead, outcome: 'exiting', count: 1 }] });
    expect(won?.phase).toBe('won');
    expect(replayRun(board, { ...run, history: [{ arrowId: lead, outcome: 'blocked', count: 3 }] })?.phase).toBe('lost');
    const zen = replayRun(board, { ...run, mode: 'zen', history: [{ arrowId: lead, outcome: 'blocked', count: 30 }] });
    expect(zen).toMatchObject({ phase: 'ready', moves: 30, mistakes: 30, hearts: 3 });
  });
  it('catches denied reads/writes, quota errors and unavailable storage', () => {
    const denied: SettingsStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    expect(loadProgress(denied).notice).toBeTruthy(); expect(saveProgress(denied, progress)).toBe(false);
    expect(loadProgress(undefined).notice).toBeTruthy(); expect(saveProgress(undefined, progress)).toBe(false);
  });
  it('compresses consecutive blocked attempts but bounds both memory and replay work', () => {
    let history = appendAttempt([], lead, 'blocked')!;
    for (let i = 1; i < MAX_REPLAY_ATTEMPTS; i++) history = appendAttempt(history, lead, 'blocked')!;
    expect(history).toEqual([{ arrowId: lead, outcome: 'blocked', count: MAX_REPLAY_ATTEMPTS }]);
    expect(appendAttempt(history, lead, 'blocked')).toBeUndefined();
    const full = Array.from({ length: MAX_HISTORY }, (_, i) => ({ arrowId: String(i), outcome: 'blocked' as const, count: 1 }));
    expect(appendAttempt(full, 'new', 'exiting')).toBeUndefined();
    expect(appendAttempt(full, String(MAX_HISTORY - 1), 'blocked')).toHaveLength(MAX_HISTORY);
  });
});
