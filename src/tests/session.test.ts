import { describe, expect, it, vi } from 'vitest';
import { GameSession } from '../gameplay/session';
import { getLevel } from '../game/levels';
import type { LevelResult } from '../game/levels';
import { getSafeArrowIds } from '../game/rules';
import { decodeProgress, freshProgress, levelIdentity, MAX_REPLAY_ATTEMPTS, PROGRESS_KEY } from '../storage/progress';
import { memoryStorage } from './fixtures/storage';
import type { Progress } from '../storage/progress';

function setup(progress = freshProgress(), provider = getLevel) {
  const storage = memoryStorage(), changed = vi.fn();
  const session = new GameSession(progress, storage, changed, provider);
  return { session, storage, changed };
}
describe('real gameplay orchestration and commit boundaries', () => {
  it('holds pending occupancy/hearts until completion and unlocks only after real victory', async () => {
    const { session, storage } = setup(); await session.load(1);
    const original = session.current.state!;
    const attempt = session.attempt(original.level.arrows[0]!.id)!;
    expect(attempt.result.type).toBe('exiting'); expect(session.current.state?.phase).toBe('animating');
    expect(session.current.state?.activeArrowIds.size).toBe(1); expect(session.current.progress.highestUnlocked).toBe(1);
    expect(decodeProgress(storage.getItem(PROGRESS_KEY)).progress.run?.history).toEqual([]);
    session.complete(attempt.token);
    expect(session.current.state).toMatchObject({ phase: 'won', hearts: 3, moves: 1 }); expect(session.current.progress.highestUnlocked).toBe(2);
    const completed = session.current.state; session.complete(attempt.token); expect(session.current.state).toBe(completed);
    expect(original.activeArrowIds.size).toBe(1); expect(Object.isFrozen(original.level.arrows[0]!.cells)).toBe(true);
  });
  it('blocked Challenge moves commit immediately, name the real blocker and lose exactly at three', async () => {
    const { session, storage } = setup({ ...freshProgress(), highestUnlocked: 2 }); await session.load(2);
    const [lead, gate] = session.current.state!.level.arrows;
    for (let i = 1; i <= 3; i++) {
      expect(session.attempt(lead!.id)?.result).toMatchObject({ type: 'blocked', blockerId: gate!.id });
      expect(session.current.state?.hearts).toBe(3 - i);
      expect(decodeProgress(storage.getItem(PROGRESS_KEY)).progress.run?.history[0]?.count).toBe(i);
    }
    expect(session.current.state?.phase).toBe('lost'); expect(session.current.state?.activeArrowIds.size).toBe(2);
    expect(session.attempt(gate!.id)?.result.type).toBe('ignored'); expect(session.next()).toBeUndefined();
    session.restart('zen'); expect(session.current.state).toMatchObject({ phase: 'ready', hearts: 3, mistakes: 0, mode: 'zen' });
    for (let i = 0; i < 5; i++) session.attempt(lead!.id);
    expect(session.current.state).toMatchObject({ phase: 'ready', hearts: 3, mistakes: 5 });
  });
  it.each(['restart', 'home', 'settings', 'unmount', 'pagehide'])('interrupting by %s invalidates stale completion and preserves committed moves', async kind => {
    const { session } = setup(); await session.load(1);
    const attempt = session.attempt(session.current.state!.level.arrows[0]!.id)!;
    if (kind === 'restart') session.restart(); else session.interrupt();
    session.complete(attempt.token); expect(session.current.state).toMatchObject({ phase: 'ready', moves: 0 });
    expect(session.current.state?.activeArrowIds.size).toBe(1); expect(session.current.progress.highestUnlocked).toBe(1);
  });
  it('reopening during extraction restores the last committed state', async () => {
    const { session, storage } = setup({ ...freshProgress(), highestUnlocked: 2 }); await session.load(2);
    const [lead, gate] = session.current.state!.level.arrows; session.attempt(lead!.id); session.attempt(gate!.id);
    const saved = decodeProgress(storage.getItem(PROGRESS_KEY));
    const reopened = new GameSession(saved.progress, storage, () => {}); await reopened.load();
    expect(reopened.current.state).toMatchObject({ phase: 'ready', hearts: 2, moves: 1, mistakes: 1 });
    expect(reopened.current.state?.activeArrowIds.size).toBe(2);
  });
  it('next only follows won state, uses deterministic levels, and same-level restart clears history', async () => {
    const { session } = setup(); await session.load(1); expect(session.next()).toBeUndefined();
    const attempt = session.attempt(session.current.state!.level.arrows[0]!.id)!; session.complete(attempt.token); await session.next();
    const second = getLevel(2); if (!second.ok) throw new Error(second.message);
    expect(session.current.number).toBe(2); expect(session.current.state?.level).toEqual(second.level);
    const identity = levelIdentity(session.current.state!.level); session.restart();
    expect(levelIdentity(session.current.state!.level)).toBe(identity); expect(session.current.progress.run?.history).toEqual([]);
  });
  it.each([1, 4, 10, 11, 81])('real level %s can be cleared via actual engine attempts and completed animations', async number => {
    const { session, storage } = setup({ ...freshProgress(), highestUnlocked: number }); await session.load(number);
    const geometry = JSON.stringify(session.current.state!.level);
    while (session.current.state?.phase === 'ready') {
      const attempt = session.attempt(getSafeArrowIds(session.current.state)[0]!)!;
      expect(session.attempt(attempt.result.state.level.arrows[0]!.id)?.result.type).toBe('ignored');
      session.complete(attempt.token);
    }
    expect(session.current.state?.phase).toBe('won'); expect(session.current.state?.hearts).toBe(3);
    expect(JSON.stringify(session.current.state!.level)).toBe(geometry);
    const reopened = new GameSession(decodeProgress(storage.getItem(PROGRESS_KEY)).progress, storage, () => {}); await reopened.load();
    expect(reopened.current.state).toEqual(session.current.state);
  });
  it.each<Extract<LevelResult, { ok: false }>>([
    { ok: false, reason: 'generation-failed', message: 'Budget exhausted' },
    { ok: false, reason: 'invalid-level-number', message: 'Invalid number' },
    { ok: false, reason: 'unsupported-difficulty', message: 'Invalid difficulty' },
  ])('handles typed preparation failure %j without inventing a board', async failure => {
    const { session } = setup(freshProgress(), () => failure); await session.load(11);
    expect(session.current.loading).toBe(false); expect(session.current.state).toBeUndefined(); expect(session.current.error).toContain(failure.message);
    expect(session.attempt('anything')).toBeUndefined(); expect(session.current.progress.highestUnlocked).toBe(1);
  });
  it('ignores asynchronous load completion after navigation and after a newer request', async () => {
    const waiting: ((result: LevelResult) => void)[] = [];
    const session = new GameSession(freshProgress(), memoryStorage(), () => {}, () => new Promise(resolve => waiting.push(resolve)));
    const first = session.load(1); expect(session.current.loading).toBe(true);
    const second = session.load(2); waiting[1]!(getLevel(2)); await second; waiting[0]!(getLevel(1)); await first;
    expect(session.current.number).toBe(2); expect(session.current.state?.level.id).toBe('onboarding-02');
    const third = session.load(3); session.interrupt(); waiting[2]!(getLevel(3)); await third;
    expect(session.current.state).toBeUndefined(); expect(session.current.loading).toBe(false);
  });
  it('catches provider exceptions and a retry recovers', async () => {
    let failed = true;
    const { session } = setup(freshProgress(), () => { if (failed) throw new Error('unexpected'); return getLevel(1); });
    await session.load(); expect(session.current.error).toBeTruthy(); failed = false; await session.load(); expect(session.current.state?.phase).toBe('ready');
  });
  it('preserves independent progress and rejects stale saved histories', async () => {
    const progress: Progress = { ...freshProgress(), highestUnlocked: 8, run: { number: 2, identity: 'old', mode: 'challenge', history: [] } };
    const { session } = setup(progress); await session.load();
    expect(session.current.state?.moves).toBe(0); expect(session.current.progress.highestUnlocked).toBe(8); expect(session.current.notice).toContain('no longer matches');
  });
  it('selecting a mode before load retains the existing run and unlocks', () => {
    const result = getLevel(1); if (!result.ok) throw new Error(result.message);
    const progress: Progress = { ...freshProgress(), highestUnlocked: 5, run: { number: 1, identity: levelIdentity(result.level), mode: 'challenge', history: [] } };
    const { session } = setup(progress); session.selectMode('zen');
    expect(session.current.progress).toMatchObject({ mode: 'zen', highestUnlocked: 5, run: progress.run });
  });
  it('quota failure is nonblocking, and gameplay still completes', async () => {
    const session = new GameSession(freshProgress(), { getItem: () => null, setItem: () => { throw new Error('quota'); } }, () => {});
    await session.load(); const attempt = session.attempt(session.current.state!.level.arrows[0]!.id)!; session.complete(attempt.token);
    expect(session.current.state?.phase).toBe('won'); expect(session.current.notice).toContain('cannot be saved'); expect(session.current.progress.highestUnlocked).toBe(2);
  });
  it('extreme Zen retries remain bounded and still allow play/unlock; restart re-enables run saving', async () => {
    const { session, storage } = setup({ ...freshProgress(), highestUnlocked: 2, mode: 'zen' }); await session.load(2);
    const lead = session.current.state!.level.arrows[0]!.id;
    for (let i = 0; i <= MAX_REPLAY_ATTEMPTS; i++) session.attempt(lead);
    expect(session.current.progress.run).toBeNull(); expect(session.current.state?.mistakes).toBe(MAX_REPLAY_ATTEMPTS + 1);
    expect(session.current.notice).toContain('save limit'); expect(storage.getItem(PROGRESS_KEY)!.length).toBeLessThan(200);
    while (session.current.state?.phase === 'ready') { const move = session.attempt(getSafeArrowIds(session.current.state)[0]!)!; session.complete(move.token); }
    expect(session.current.progress.highestUnlocked).toBe(3);
    session.restart(); expect(session.current.progress.run?.history).toEqual([]);
  });
});
