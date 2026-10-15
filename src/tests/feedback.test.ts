import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameFeedback, soundPhrase } from '../feedback/game-feedback';

function audioPort(initial: AudioContextState = 'running') {
  const voices: { kind: string; node: ReturnType<typeof node>; frequency?: ReturnType<typeof param>; samples?: Float32Array }[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null });
  let resumeResolve: (() => void) | undefined;
  const ctx = {
    state: initial, currentTime: 0, sampleRate: 8000, destination: {},
    resume: vi.fn(async () => { ctx.state = 'running'; }),
    suspend: vi.fn(async () => { ctx.state = 'suspended'; }),
    close: vi.fn(async () => { ctx.state = 'closed'; }),
    createGain: vi.fn(() => ({ ...node(), gain: param() })),
    createOscillator: vi.fn(() => { const oscillator = { ...node(), type: 'sine', frequency: param() }; voices.push({ kind: 'tone', node: oscillator, frequency: oscillator.frequency }); return oscillator; }),
    createBuffer: vi.fn((_channels: number, count: number) => { const samples = new Float32Array(count); return { getChannelData: () => samples }; }),
    createBufferSource: vi.fn(() => { const source = { ...node(), buffer: null }; voices.push({ kind: 'noise', node: source }); return source; }),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: '', frequency: param(), Q: param() })),
  };
  const factory = vi.fn(() => ctx as unknown as AudioContext), vibrate = vi.fn((_pattern: number | number[]) => true), status = vi.fn();
  const feedback = new GameFeedback({ sound: true, haptics: true }, { context: factory, vibrate, status });
  return { ctx, voices, factory, vibrate, status, feedback,
    delayResume() { ctx.state = 'suspended'; const pending = new Promise<void>(resolve => { resumeResolve = () => { ctx.state = 'running'; resolve(); }; }); ctx.resume.mockImplementation(() => pending); },
    async resumed() { resumeResolve?.(); await Promise.resolve(); await Promise.resolve(); },
  };
}
afterEach(() => vi.useRealTimers());
describe('minimal original audio and optional haptics', () => {
  it('constructs lazily, uses one context and synchronizes launch with one finite swish', () => {
    vi.useFakeTimers(); const h = audioPort(); expect(h.factory).not.toHaveBeenCalled();
    h.feedback.launch(600, false); expect(h.factory).toHaveBeenCalledTimes(1);
    expect(h.voices.map(v => v.kind)).toEqual(['tone', 'noise']); expect(h.vibrate).toHaveBeenCalledWith(7);
    h.feedback.complete(); h.feedback.blocked(); h.feedback.victory(); expect(h.factory).toHaveBeenCalledTimes(1);
    expect(h.voices.filter(v => v.kind === 'tone')).toHaveLength(6);
    expect(h.vibrate.mock.calls.map(([pattern]) => pattern)).toEqual([7, 12, [8, 35, 10]]);
    vi.runAllTimers(); expect(h.ctx.suspend).toHaveBeenCalled();
    expect(h.status).toHaveBeenLastCalledWith(expect.objectContaining({ voices: 0 })); h.feedback.dispose();
  });
  it.each(['launch', 'complete', 'blocked', 'victory'] as const)('%s has bounded volume, envelopes and distinct original pitches', event => {
    const phrase = soundPhrase(event); expect(phrase.length).toBeGreaterThan(0);
    expect(phrase.reduce((sum, tone) => sum + tone.gain, 0)).toBeLessThan(.08);
    for (const tone of phrase) { expect(tone.duration).toBeLessThan(.3); expect(tone.offset + tone.duration).toBeLessThan(.6); }
    expect(soundPhrase('blocked')[0]!.frequency).not.toBe(soundPhrase('launch')[0]!.frequency);
  });
  it('mute avoids context creation while independent enabled haptics still work', () => {
    const h = audioPort(); h.feedback.configure({ sound: false, haptics: true });
    h.feedback.launch(500, false); h.feedback.blocked(); h.feedback.victory();
    expect(h.factory).not.toHaveBeenCalled(); expect(h.vibrate).toHaveBeenCalledTimes(3); h.feedback.dispose();
  });
  it('disabled haptics stay off while enabled audio still works', () => {
    const h = audioPort(); h.feedback.configure({ sound: true, haptics: false }); h.feedback.blocked();
    expect(h.vibrate).not.toHaveBeenCalled(); expect(h.voices).toHaveLength(1); h.feedback.dispose();
  });
  it('reduced motion has a quiet pluck without travel noise', () => {
    const h = audioPort(); h.feedback.launch(600, true); expect(h.voices.map(v => v.kind)).toEqual(['tone']); h.feedback.dispose();
  });
  it('cancel stops/disconnects scheduled voices and vibration and clears idle work', () => {
    vi.useFakeTimers(); const h = audioPort(); h.feedback.launch(800, false); h.feedback.cancel();
    for (const voice of h.voices) { expect(voice.node.stop).toHaveBeenCalled(); expect(voice.node.disconnect).toHaveBeenCalledTimes(1); expect(voice.node.onended).toBeNull(); }
    expect(h.vibrate).toHaveBeenLastCalledWith(0); expect(vi.getTimerCount()).toBe(0);
    h.feedback.dispose(); h.feedback.dispose(); expect(h.ctx.close).toHaveBeenCalledTimes(1);
  });
  it.each(['cancel', 'mute', 'dispose'])('%s invalidates an asynchronous autoplay resume before any voice can sound', async action => {
    const h = audioPort(); h.delayResume(); h.feedback.launch(800, false);
    if (action === 'cancel') h.feedback.cancel(); else if (action === 'mute') h.feedback.configure({ sound: false, haptics: true }); else h.feedback.dispose();
    await h.resumed(); expect(h.voices).toHaveLength(0);
    expect(h.ctx.suspend).toHaveBeenCalled(); h.feedback.dispose();
  });
  it('does not play a delayed launch after extraction already completed', async () => {
    const h = audioPort(); h.delayResume(); h.feedback.launch(600, false);
    // An immediate reduced-motion completion invalidates the pending launch.
    h.feedback.complete(); await h.resumed();
    expect(h.voices.map(v => v.kind)).toEqual(['tone']);
    expect(h.voices[0]!.frequency!.setValueAtTime).toHaveBeenCalledWith(soundPhrase('complete')[0]!.frequency, 0); h.feedback.dispose();
  });
  it('tolerates missing, rejected or throwing audio/haptic APIs', async () => {
    const missing = new GameFeedback({ sound: true, haptics: true }, { context: () => undefined, vibrate: () => { throw new Error('denied'); } });
    expect(() => { missing.launch(500, false); missing.complete(); missing.blocked(); missing.victory(); missing.cancel(); missing.dispose(); }).not.toThrow();
    const h = audioPort('suspended'); h.ctx.resume.mockRejectedValue(new Error('autoplay denied'));
    h.feedback.launch(500, false); await Promise.resolve(); expect(h.voices).toHaveLength(0); h.feedback.dispose();
    const throwing = new GameFeedback({ sound: true, haptics: false }, { context: () => { throw new Error('unavailable'); } });
    expect(() => throwing.blocked()).not.toThrow(); throwing.dispose();
  });
  it('keeps voice count bounded under rapid repeated feedback', () => {
    const h = audioPort(); for (let i = 0; i < 50; i++) h.feedback.blocked();
    expect(h.status.mock.calls.at(-1)![0].voices).toBeLessThanOrEqual(16); h.feedback.dispose();
  });
  it('disposal prevents delayed status callbacks from mutating a remounted UI', async () => {
    const h=audioPort();h.feedback.launch(500,false);h.feedback.dispose();const count=h.status.mock.calls.length;
    await Promise.resolve();await Promise.resolve();expect(h.status).toHaveBeenCalledTimes(count);
  });
});
