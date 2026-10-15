import type { ArrowPath, Direction, GridPoint } from '../game/types';

export interface PreviewArtwork {
  readonly columns: number;
  readonly rows: number;
  readonly arrows: readonly ArrowPath[];
  readonly accentIds: readonly string[];
}

function path(id: string, direction: Direction, ...coordinates: [number, number][]): ArrowPath {
  const cells = coordinates.map(([x, y]): GridPoint => ({ x, y }));
  const first = cells[0];
  if (!first) throw new Error('Preview paths need at least one cell.');
  return { id, direction, cells: [first, ...cells.slice(1)] };
}

/** Hand-drawn compositions, not levels or generated puzzles. */
export const boardArtwork: PreviewArtwork = {
  columns: 12,
  rows: 12,
  arrows: [
    path('a', 'right', [1, 1], [2, 1], [3, 1], [4, 1]),
    path('b', 'down', [6, 1], [7, 1], [8, 1], [8, 2], [8, 3]),
    path('c', 'down', [10, 1], [10, 2], [10, 3], [10, 4], [10, 5]),
    path('d', 'up', [1, 5], [1, 4], [1, 3]),
    path('e', 'right', [3, 5], [3, 4], [3, 3], [4, 3], [5, 3], [5, 4], [5, 5], [6, 5]),
    path('f', 'left', [8, 7], [8, 6], [8, 5], [7, 5]),
    path('g', 'right', [1, 7], [2, 7], [3, 7], [4, 7], [4, 8], [4, 9], [5, 9], [6, 9]),
    path('h', 'up', [10, 10], [9, 10], [8, 10], [8, 9]),
    path('i', 'left', [3, 10], [2, 10], [1, 10]),
    path('j', 'up', [10, 8], [10, 7]),
  ],
  accentIds: ['e', 'h'],
};

export const homeArtwork: PreviewArtwork = {
  columns: 12,
  rows: 12,
  arrows: [
    path('a', 'right', [2, 2], [3, 2], [4, 2], [5, 2]),
    path('b', 'down', [7, 2], [8, 2], [9, 2], [9, 3], [9, 4]),
    path('c', 'up', [2, 7], [2, 6], [2, 5], [2, 4]),
    path('d', 'right', [4, 7], [4, 6], [4, 5], [5, 5], [6, 5], [6, 6], [6, 7], [7, 7], [8, 7]),
    path('e', 'left', [7, 9], [6, 9], [5, 9], [4, 9]),
    path('f', 'up', [10, 9], [10, 8], [10, 7]),
  ],
  accentIds: ['d'],
};
