import { describe, expect, it } from 'vitest';
import { backingSize, directionVectors, fitGrid } from '../graphics/geometry';
import { boardArtwork, homeArtwork } from '../graphics/preview';

describe('canvas sizing', () => {
  it('centres the same square cells in portrait and landscape without distortion', () => {
    const portrait = fitGrid(320, 480, 12, 12);
    const landscape = fitGrid(480, 320, 12, 12);
    expect(portrait.cell).toBe(landscape.cell);
    expect(portrait.offsetY - portrait.offsetX).toBe(80);
    expect(landscape.offsetX - landscape.offsetY).toBe(80);
    expect(portrait.offsetX * 2 + 11 * portrait.cell).toBeCloseTo(320);
    expect(portrait.offsetY * 2 + 11 * portrait.cell).toBeCloseTo(480);
  });

  it('fits rectangular grids and rejects dimensions that cannot be rendered', () => {
    const grid = fitGrid(400, 200, 16, 8);
    expect(grid.cell * 16).toBeLessThan(400);
    expect(grid.cell * 8).toBeLessThan(200);
    expect(() => fitGrid(0, 400, 12, 12)).toThrow(RangeError);
    expect(() => fitGrid(400, 400, NaN, 12)).toThrow(RangeError);
    expect(() => fitGrid(400, Infinity, 12, 12)).toThrow(RangeError);
  });

  it('scales the backing buffer at high and fractional device pixel ratios', () => {
    expect(backingSize(320, 480, 3)).toEqual({ width: 960, height: 1440 });
    expect(backingSize(321, 401, 1.25)).toEqual({ width: 401, height: 501 });
    expect(backingSize(320, 480, NaN)).toEqual({ width: 320, height: 480 });
  });
});

describe('original preview artwork data', () => {
  for (const [name, artwork] of Object.entries({ home: homeArtwork, board: boardArtwork })) {
    it(`${name} uses unique paths with adjacent cells, valid headings and in-bounds coordinates`, () => {
      expect(new Set(artwork.arrows.map((arrow) => arrow.id)).size).toBe(artwork.arrows.length);
      for (const arrow of artwork.arrows) {
        expect(arrow.cells.length).toBeGreaterThan(1);
        for (const [index, point] of arrow.cells.entries()) {
          expect(Number.isInteger(point.x) && Number.isInteger(point.y)).toBe(true);
          expect(point.x >= 0 && point.x < artwork.columns && point.y >= 0 && point.y < artwork.rows).toBe(true);
          const previous = arrow.cells[index - 1];
          if (previous) expect(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)).toBe(1);
        }
        const head = arrow.cells.at(-1)!;
        const previous = arrow.cells.at(-2)!;
        expect({ x: head.x - previous.x, y: head.y - previous.y }).toEqual(directionVectors[arrow.direction]);
      }
      for (const accentId of artwork.accentIds) expect(artwork.arrows.some((arrow) => arrow.id === accentId)).toBe(true);
    });
  }
});
