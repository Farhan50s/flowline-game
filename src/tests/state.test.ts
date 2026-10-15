import { describe, expect, it } from 'vitest';
import { getSafeArrowIds, InvalidLevelError } from '../game/rules';
import { attemptMove, completeEscape, createGameState, restartLevel } from '../game/state';
import type { GameMode, GameState } from '../game/types';
import { bentBlockedLevel, chainLevel, fixtureLevel, selfRayLevel, singleArrowLevel } from './fixtures/puzzles';

/** Throws if a transition tries to mutate a Set from an earlier snapshot. */
function guardState(state: GameState): GameState {
  const active = new Set(state.activeArrowIds);
  const forbidden = () => { throw new Error('Attempted to mutate incoming activeArrowIds'); };
  Object.defineProperties(active, {
    add: { value: forbidden }, delete: { value: forbidden }, clear: { value: forbidden },
  });
  return Object.freeze({ ...state, activeArrowIds: active });
}

function capture(state: GameState) {
  return { ...state, level: structuredClone(state.level), activeArrowIds: [...state.activeArrowIds] };
}

describe('initialization and independent snapshots', () => {
  it.each(['challenge', 'zen'] as const)('initializes %s with all arrows, counters cleared and no pending ID', (mode) => {
    const state = createGameState(chainLevel, mode);
    expect(state).toEqual({
      level: chainLevel, mode, phase: 'ready', hearts: 3,
      activeArrowIds: new Set(['lead', 'far', 'near', 'unrelated']), moves: 0, mistakes: 0,
    });
    expect(state).not.toHaveProperty('pendingArrowId');
  });

  it('rejects invalid level geometry with structured, actionable errors', () => {
    expect(() => createGameState(selfRayLevel, 'zen')).toThrow(InvalidLevelError);
    expect(() => createGameState(selfRayLevel, 'zen')).toThrow(/arrows\[0\].cells.*head exit lane/);
  });

  it('rejects unsupported modes', () => {
    expect(() => createGameState(chainLevel, 'relaxed' as GameMode)).toThrow(RangeError);
  });

  it('initializes an empty level as won', () => {
    const state = createGameState(fixtureLevel([], 1, 1), 'challenge');
    expect(state.phase).toBe('won');
    expect(state.activeArrowIds.size).toBe(0);
    expect(attemptMove(state, 'anything').state).toBe(state);
  });

  it('creates separate Sets, level arrays, arrow arrays and point objects', () => {
    const first = createGameState(chainLevel, 'challenge');
    const second = createGameState(chainLevel, 'challenge');
    expect(first).toEqual(second);
    expect(first.activeArrowIds).not.toBe(second.activeArrowIds);
    expect(first.level).not.toBe(chainLevel);
    expect(first.level.arrows).not.toBe(chainLevel.arrows);
    expect(first.level.arrows[0]).not.toBe(chainLevel.arrows[0]);
    expect(first.level.arrows[0]!.cells).not.toBe(chainLevel.arrows[0]!.cells);
    expect(first.level.arrows[0]!.cells[0]).not.toBe(chainLevel.arrows[0]!.cells[0]);
  });

  it('does not freeze caller-owned data and detaches state from later caller edits', () => {
    const source = {
      id: 'mutable-input', width: 5, height: 5, seed: 123,
      arrows: [{ id: 'a', direction: 'right' as const, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }] as [{ x: number; y: number }, { x: number; y: number }] }],
    };
    const state = createGameState(source, 'zen');
    const before = capture(state);
    source.width = 2;
    source.seed = 456;
    source.arrows[0]!.cells[0].x = 4;
    source.arrows.length = 0;
    expect(capture(state)).toEqual(before);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.level)).toBe(true);
    expect(Object.isFrozen(state.level.arrows)).toBe(true);
    expect(Object.isFrozen(state.level.arrows[0]!.cells)).toBe(true);
    expect(Object.isFrozen(state.level.arrows[0]!.cells[0])).toBe(true);
  });
});

describe('attempts, hearts and animation commitment', () => {
  it('a blocked Challenge attempt costs exactly one heart, mistake and move, keeping every path active', () => {
    const state = createGameState(chainLevel, 'challenge');
    const result = attemptMove(state, 'lead');
    expect(result.type).toBe('blocked');
    if (result.type !== 'blocked') throw new Error('Expected blocked feedback');
    expect(result.arrowId).toBe('lead');
    expect(result.blockerId).toBe('near');
    expect(result.state).toMatchObject({ phase: 'ready', moves: 1, mistakes: 1, hearts: 2 });
    expect(result.state.activeArrowIds).toEqual(state.activeArrowIds);
    expect(result.state).not.toHaveProperty('pendingArrowId');
  });

  it('Zen allows unlimited blocked retries without losing a heart or entering lost', () => {
    let state = createGameState(chainLevel, 'zen');
    for (let attempt = 1; attempt <= 12; attempt++) {
      const result = attemptMove(state, 'lead');
      expect(result.type).toBe('blocked');
      state = result.state;
      expect(state).toMatchObject({ phase: 'ready', hearts: 3, moves: attempt, mistakes: attempt });
      expect(state.activeArrowIds.size).toBe(4);
    }
  });

  it('a safe attempt enters animating, retaining all occupancy until completion', () => {
    const state = createGameState(chainLevel, 'challenge');
    const result = attemptMove(state, 'near');
    expect(result.type).toBe('exiting');
    expect(result.state).toMatchObject({ phase: 'animating', pendingArrowId: 'near', moves: 1, mistakes: 0, hearts: 3 });
    expect(result.state.activeArrowIds).toEqual(state.activeArrowIds);
    expect(getSafeArrowIds(result.state)).not.toContain('lead');
    expect(attemptMove(result.state, 'near')).toMatchObject({ type: 'ignored', state: result.state, reason: 'not-ready' });
  });

  it('completion removes exactly the pending arrow and discovers the next blocker', () => {
    const original = createGameState(chainLevel, 'challenge');
    const animating = attemptMove(original, 'near').state;
    const completed = completeEscape(animating);
    expect(completed).toMatchObject({ phase: 'ready', moves: 1, mistakes: 0, hearts: 3 });
    expect(completed.activeArrowIds).toEqual(new Set(['lead', 'far', 'unrelated']));
    expect(completed.activeArrowIds).not.toBe(animating.activeArrowIds);
    expect(completed).not.toHaveProperty('pendingArrowId');
    expect(animating.activeArrowIds.has('near')).toBe(true);
    expect(attemptMove(completed, 'lead')).toMatchObject({ type: 'blocked', blockerId: 'far' });
    const unlocked = completeEscape(attemptMove(completed, 'far').state);
    expect(getSafeArrowIds(unlocked)).toEqual(['lead', 'unrelated']);
    expect(attemptMove(unlocked, 'lead').type).toBe('exiting');
  });

  it.each(['challenge', 'zen'] as const)('the final arrow wins only after completion in %s', (mode) => {
    const animating = attemptMove(createGameState(singleArrowLevel, mode), 'only').state;
    expect(animating.phase).toBe('animating');
    expect(animating.activeArrowIds.has('only')).toBe(true);
    const won = completeEscape(animating);
    expect(won).toMatchObject({ phase: 'won', hearts: 3, moves: 1, mistakes: 0 });
    expect(won.activeArrowIds.size).toBe(0);
    expect(won).not.toHaveProperty('pendingArrowId');
    expect(getSafeArrowIds(won)).toEqual([]);
    expect(completeEscape(won)).toBe(won);
  });

  it('precisely three blocked Challenge attempts cause loss; further input has no penalty', () => {
    let state = createGameState(chainLevel, 'challenge');
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = attemptMove(state, 'lead');
      expect(result.type).toBe('blocked');
      state = result.state;
      expect(state).toMatchObject({ hearts: 3 - attempt, moves: attempt, mistakes: attempt, phase: attempt === 3 ? 'lost' : 'ready' });
    }
    for (const id of ['lead', 'near', 'unknown']) {
      const result = attemptMove(state, id);
      expect(result.type).toBe('ignored');
      expect(result.state).toBe(state);
    }
    expect(state.activeArrowIds.size).toBe(4);
    expect(completeEscape(state)).toBe(state);
  });

  it('unknown and removed IDs are exact no-ops without incrementing metrics', () => {
    const state = createGameState(chainLevel, 'challenge');
    expect(attemptMove(state, 'missing')).toEqual({ type: 'ignored', state, reason: 'unknown-arrow' });
    expect(attemptMove(state, 'missing').state).toBe(state);
    const after = completeEscape(attemptMove(state, 'near').state);
    expect(attemptMove(after, 'near')).toEqual({ type: 'ignored', state: after, reason: 'inactive-arrow' });
    expect(attemptMove(after, 'near').state).toBe(after);
  });

  it('all taps during animation and after victory return the same state', () => {
    const animating = attemptMove(createGameState(chainLevel, 'challenge'), 'near').state;
    const won = completeEscape(attemptMove(createGameState(singleArrowLevel, 'zen'), 'only').state);
    for (const state of [animating, won]) {
      const before = capture(state);
      for (const id of ['near', 'lead', 'only', 'unknown']) {
        const result = attemptMove(state, id);
        expect(result.type).toBe('ignored');
        expect(result.state).toBe(state);
      }
      expect(capture(state)).toEqual(before);
    }
  });

  it('completion without a current valid pending escape is a documented exact no-op', () => {
    const ready = createGameState(chainLevel, 'zen');
    const withoutPending: GameState = { ...ready, phase: 'animating' };
    const inactivePending: GameState = { ...ready, phase: 'animating', pendingArrowId: 'missing' };
    const wrongPhase: GameState = { ...ready, pendingArrowId: 'near' };
    for (const state of [ready, withoutPending, inactivePending, wrongPhase]) expect(completeEscape(state)).toBe(state);
  });

  it('keeps the selector ordered by level data, independently of phase and Set order', () => {
    const initial = createGameState(chainLevel, 'zen');
    const reversed: GameState = { ...initial, activeArrowIds: new Set(['unrelated', 'near', 'far', 'lead']) };
    expect(getSafeArrowIds(reversed)).toEqual(['far', 'near', 'unrelated']);
    expect(getSafeArrowIds(attemptMove(initial, 'near').state)).toEqual(['far', 'near', 'unrelated']);
  });
});

describe('restart, immutable transitions and deterministic replay', () => {
  it.each(['challenge', 'zen'] as const)('restarts %s without regenerating data or changing the old state', (mode) => {
    let state = createGameState(chainLevel, mode);
    state = attemptMove(state, 'lead').state;
    state = completeEscape(attemptMove(state, 'near').state);
    state = attemptMove(state, 'far').state; // Reset with a pending escape, too.
    const before = capture(state);
    const restarted = restartLevel(state);
    expect(restarted).toEqual(createGameState(chainLevel, mode));
    expect(restarted.level.seed).toBe(31415);
    expect(restarted.level.difficulty).toBe('medium');
    expect(restarted.level).toEqual(state.level);
    expect(restarted.level).not.toBe(state.level);
    expect(restarted.activeArrowIds).not.toBe(state.activeArrowIds);
    expect(restarted).not.toHaveProperty('pendingArrowId');
    expect(capture(state)).toEqual(before);
  });

  it('restarts a lost Challenge board and a completed board with all paths restored', () => {
    let lost = createGameState(chainLevel, 'challenge');
    for (let index = 0; index < 3; index++) lost = attemptMove(lost, 'lead').state;
    expect(restartLevel(lost)).toEqual(createGameState(chainLevel, 'challenge'));
    const won = completeEscape(attemptMove(createGameState(singleArrowLevel, 'challenge'), 'only').state);
    expect(restartLevel(won)).toEqual(createGameState(singleArrowLevel, 'challenge'));
  });

  it('accepts fully frozen level/arrow/cell inputs and preserves every input snapshot through all transition types', () => {
    const input = structuredClone(bentBlockedLevel);
    for (const arrow of input.arrows) {
      for (const point of arrow.cells) Object.freeze(point);
      Object.freeze(arrow.cells);
      Object.freeze(arrow);
    }
    Object.freeze(input.arrows);
    Object.freeze(input);
    const inputBefore = structuredClone(input);
    const original = guardState(createGameState(input, 'challenge'));
    const before = capture(original);
    expect(attemptMove(original, 'bent').type).toBe('blocked');
    expect(attemptMove(original, 'unknown').state).toBe(original);
    expect(completeEscape(original)).toBe(original);
    expect(getSafeArrowIds(original)).toEqual(['lane-body']);
    restartLevel(original);
    const animating = guardState(attemptMove(original, 'lane-body').state);
    const pendingBefore = capture(animating);
    const completed = completeEscape(animating);
    expect(completed.activeArrowIds).toEqual(new Set(['bent', 'off-lane']));
    expect(capture(animating)).toEqual(pendingBefore);
    expect(capture(original)).toEqual(before);
    expect(input).toEqual(inputBefore);
  });

  it('does not mutate earlier snapshots when a later Challenge attempt reaches loss', () => {
    let state = guardState(createGameState(chainLevel, 'challenge'));
    const history: { state: GameState; snapshot: ReturnType<typeof capture> }[] = [];
    for (let index = 0; index < 3; index++) {
      history.push({ state, snapshot: capture(state) });
      state = guardState(attemptMove(state, 'lead').state);
    }
    expect(state.phase).toBe('lost');
    for (const entry of history) expect(capture(entry.state)).toEqual(entry.snapshot);
  });

  it('replays explicit attempts and completions deterministically to victory with correct aggregate metrics', () => {
    const replay = () => {
      let state = createGameState(chainLevel, 'challenge');
      state = attemptMove(state, 'lead').state; // Deliberately blocked once.
      state = attemptMove(state, 'unknown').state; // Does not count.
      for (const id of ['near', 'far', 'lead', 'unrelated']) {
        const before = capture(state);
        const result = attemptMove(state, id);
        expect(result.type).toBe('exiting');
        expect(capture(state)).toEqual(before);
        expect(attemptMove(result.state, id).type).toBe('ignored');
        state = completeEscape(result.state);
        expect(completeEscape(state)).toBe(state);
      }
      return state;
    };
    const first = replay();
    const second = replay();
    expect(first).toEqual(second);
    expect(first).toMatchObject({ phase: 'won', hearts: 2, moves: 5, mistakes: 1 });
    expect(first.activeArrowIds.size).toBe(0);
    expect(restartLevel(first)).toEqual(createGameState(chainLevel, 'challenge'));
  });
});
