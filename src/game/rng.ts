/** Stable Mulberry32 stream. Seeds are unsigned 32-bit integers, including zero. */
export class SeedError extends RangeError {
  readonly code = 'invalid-seed';
}

export function isSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xFFFF_FFFF;
}

export interface SeededRng {
  next(): number;
  /** Inclusive lower bound, exclusive upper bound. */
  int(min: number, max: number): number;
}

export function createRng(seed: number): SeededRng {
  if (!isSeed(seed)) throw new SeedError('Seed must be an integer from 0 to 4294967295.');
  let state = seed;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return Object.freeze({
    next,
    int(min: number, max: number) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min || max - min > 4294967296) {
        throw new RangeError('Random integer bounds must be safe integers spanning 1..4294967296 values.');
      }
      return min + Math.floor(next() * (max - min));
    },
  });
}
