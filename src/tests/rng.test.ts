import { describe, expect, it } from 'vitest';
import { createRng, SeedError } from '../game/rng';

describe('Mulberry32 seed contract', () => {
  it('matches a fixed uint32 reference stream for seed 1', () => {
    const rng = createRng(1);
    expect(Array.from({ length: 5 }, () => rng.next())).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
      0.9810509674716741, 0.9683778982143849,
    ]);
  });
  it.each([0, 1, 0xFFFF_FFFF])('is reproducible with independent streams for seed %s', (seed) => {
    const first = createRng(seed);
    const second = createRng(seed);
    const unrelated = createRng(123);
    for (let index = 0; index < 100; index++) {
      const next = first.next();
      unrelated.next(); unrelated.int(0, 17);
      expect(second.next()).toBe(next);
      expect(next >= 0 && next < 1).toBe(true);
    }
  });
  it.each([-1, 0.5, NaN, Infinity, 4294967296])('rejects unsupported seeds without coercion: %s', (seed) => {
    expect(() => createRng(seed)).toThrow(SeedError);
  });
  it('validates inclusive/exclusive integer bounds and does not consume the stream on a bad range', () => {
    const rng = createRng(77);
    const reference = createRng(77);
    for (const [min, max] of [[1, 1], [3, 2], [0.1, 2], [0, Infinity], [0, 4294967297]]) expect(() => rng.int(min!, max!)).toThrow(RangeError);
    expect(rng.next()).toBe(reference.next());
    for (let index = 0; index < 100; index++) {
      const value = rng.int(-2, 3);
      expect(Number.isInteger(value) && value >= -2 && value < 3).toBe(true);
    }
  });
});
