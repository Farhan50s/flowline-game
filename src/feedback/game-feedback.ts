export interface FeedbackPreferences { readonly sound: boolean; readonly haptics: boolean }
export interface GameplayFeedback {
  launch(durationMs: number, reduced: boolean): void;
  complete(): void;
  blocked(): void;
  victory(): void;
  cancel(): void;
}
export interface FeedbackStatus { readonly state: string; readonly event: string; readonly voices: number }
export interface FeedbackPorts {
  readonly context: () => AudioContext | undefined;
  readonly vibrate?: (pattern: number | number[]) => boolean;
  readonly status?: (value: FeedbackStatus) => void;
  readonly now?: () => number;
}
type Tone = { readonly frequency: number; readonly end?: number; readonly offset: number; readonly duration: number; readonly gain: number; readonly type?: OscillatorType };
type SoundEvent = 'launch' | 'complete' | 'blocked' | 'victory';
/** Original, quiet synthesis recipes. No reference audio, assets, music or per-dot sounds. */
export function soundPhrase(event: SoundEvent): readonly Tone[] {
  switch (event) {
    case 'launch': return [{ frequency: 880, end: 620, offset: 0, duration: .055, gain: .035, type: 'triangle' }];
    case 'complete': return [{ frequency: 1174.66, end: 1046.5, offset: 0, duration: .085, gain: .016 }];
    case 'blocked': return [{ frequency: 196, end: 138.59, offset: 0, duration: .115, gain: .038, type: 'triangle' }];
    case 'victory': return [523.25, 659.25, 880].map((frequency, i) => ({ frequency, offset: i * .095, duration: .23, gain: .023 }));
  }
}

/** One lazily-created context. All async resume/suspension and voices are run-token guarded. */
export class GameFeedback implements GameplayFeedback {
  private context: AudioContext | undefined;
  private unavailable = false;
  private disposed = false;
  private token = 0;
  private launchRevision = 0;
  private waiting = 0;
  private suspending: Promise<void> | undefined;
  private lastEvent = '';
  private vibrating = false;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private readonly voices = new Set<() => void>();
  constructor(private preferences: FeedbackPreferences, private readonly ports: FeedbackPorts) {}
  private now() { return this.ports.now?.() ?? performance.now(); }
  private report() { if (!this.disposed) this.ports.status?.({ state: this.unavailable ? 'unavailable' : this.context?.state ?? 'uninitialized', event: this.lastEvent, voices: this.voices.size }); }
  configure(preferences: FeedbackPreferences) {
    const wasSound = this.preferences.sound;
    this.preferences = preferences;
    if (wasSound && !preferences.sound) this.stopSound();
    if (!preferences.haptics) this.stopHaptic();
    this.report();
  }
  private haptic(pattern: number | number[]) {
    if (this.disposed || !this.preferences.haptics) return;
    try { this.vibrating = this.ports.vibrate?.(pattern) ?? false; } catch { /* Unsupported/denied feedback is optional. */ }
  }
  private stopHaptic() { if (this.vibrating) { try { this.ports.vibrate?.(0); } catch { /* Device may disappear. */ } this.vibrating = false; } }
  private stopSound() {
    this.token++; this.launchRevision++; clearTimeout(this.idle); this.idle = undefined;
    for (const stop of [...this.voices]) stop();
    if (this.context?.state === 'running') {
      try {
        const suspension = this.context.suspend().catch(() => {});
        this.suspending = suspension;
        void suspension.then(() => { if (this.suspending === suspension) this.suspending = undefined; this.report(); });
      } catch { /* Optional API. */ }
    }
  }
  cancel() { this.stopSound(); this.stopHaptic(); this.report(); }
  private sound(event: SoundEvent, movementMs = 0) {
    if (this.disposed || !this.preferences.sound || this.unavailable) return;
    this.lastEvent = event;
    try { this.context ??= this.ports.context(); } catch { this.unavailable = true; }
    const ctx = this.context;
    if (!ctx || ctx.state === 'closed') { this.unavailable = true; this.report(); return; }
    const token = this.token, launchRevision = this.launchRevision, began = this.now();
    const play = () => {
      if (this.disposed || token !== this.token || !this.preferences.sound || ctx.state !== 'running' || (event === 'launch' && launchRevision !== this.launchRevision)) {
        if (!this.waiting && !this.voices.size && ctx.state === 'running') { try { void ctx.suspend().catch(() => {}); } catch { /* Optional API. */ } }
        this.report(); return;
      }
      const elapsed = (this.now() - began) / 1000;
      // Never play a late launch after its visual action has already finished.
      if (event === 'launch' && elapsed > Math.max(.12, movementMs / 1000)) { this.report(); return; }
      try {
        for (const tone of soundPhrase(event)) this.tone(ctx, tone);
        if (movementMs > 0 && elapsed < movementMs / 1000) this.swish(ctx, Math.min(.65, Math.max(.08, movementMs / 1000 - elapsed)));
      } catch { this.stopSound(); this.unavailable = true; }
      clearTimeout(this.idle);
      const revision = this.token;
      this.idle = setTimeout(() => { if (revision === this.token) { this.stopSound(); this.report(); } }, Math.max(650, movementMs + 150));
      this.report();
    };
    // Called only from genuine launch/block/keyboard gestures (victory reuses that context).
    if (ctx.state === 'running' && !this.suspending) play();
    else {
      this.waiting++;
      try {
        const resume = () => token === this.token && !this.disposed && this.preferences.sound ? ctx.resume() : Promise.resolve();
        const resumed = this.suspending ? this.suspending.then(resume) : resume();
        void resumed.then(() => { this.waiting--; play(); }, () => { this.waiting--; this.report(); });
      }
      catch { this.waiting--; this.report(); }
    }
  }
  private envelope(ctx: AudioContext, start: number, duration: number, volume: number) {
    const gain = ctx.createGain(); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(.018, duration * .22));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    gain.gain.setValueAtTime(0, start + duration + .008);
    return gain;
  }
  private track(source: AudioScheduledSourceNode, nodes: readonly AudioNode[]) {
    // Bounded even if a browser delays onended while backgrounded.
    if (this.voices.size >= 16) this.voices.values().next().value?.();
    let stopped = false;
    const stop = () => { if (stopped) return; stopped = true; source.onended = null; try { source.stop(); } catch { /* Already ended. */ } for (const node of nodes) { try { node.disconnect(); } catch { /* Already detached. */ } } this.voices.delete(stop); };
    source.onended = () => { stop(); this.report(); };
    this.voices.add(stop);
  }
  private tone(ctx: AudioContext, tone: Tone) {
    const start = ctx.currentTime + tone.offset, oscillator = ctx.createOscillator();
    oscillator.type = tone.type ?? 'sine'; oscillator.frequency.setValueAtTime(tone.frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(tone.end ?? tone.frequency, start + tone.duration);
    const gain = this.envelope(ctx, start, tone.duration, tone.gain);
    oscillator.connect(gain); this.track(oscillator, [oscillator, gain]);
    oscillator.start(start); oscillator.stop(start + tone.duration + .01);
  }
  private swish(ctx: AudioContext, duration: number) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), samples = buffer.getChannelData(0);
    // Private deterministic noise, entirely separate from every level RNG.
    let noise = 0x47f10;
    for (let i = 0; i < samples.length; i++) { noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5; samples[i] = (noise >>> 0) / 0x80000000 - 1; }
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1300; filter.Q.value = .65;
    const gain = this.envelope(ctx, ctx.currentTime, duration, .017);
    source.connect(filter); filter.connect(gain); this.track(source, [source, filter, gain]); source.start(); source.stop(ctx.currentTime + duration + .01);
  }
  launch(durationMs: number, reduced: boolean) { this.launchRevision++; this.haptic(7); this.sound('launch', reduced ? 0 : durationMs * .85); }
  complete() { this.launchRevision++; this.sound('complete'); }
  blocked() { this.haptic(12); this.sound('blocked'); }
  victory() { this.haptic([8, 35, 10]); this.sound('victory'); }
  dispose() { if (this.disposed) return; this.cancel(); this.disposed = true; try { void this.context?.close().catch(() => {}); } catch { /* Optional API. */ } this.report(); }
}

export function browserFeedback(preferences: FeedbackPreferences, status?: (value: FeedbackStatus) => void) {
  return new GameFeedback(preferences, {
    context: () => typeof AudioContext === 'undefined' ? undefined : new AudioContext(),
    ...(typeof navigator.vibrate === 'function' ? { vibrate: (pattern: number | number[]) => navigator.vibrate(pattern) } : {}),
    ...(status ? { status } : {}),
  });
}
