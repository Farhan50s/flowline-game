import type { Direction, GridPoint } from '../game/types';

export const directionVectors: Readonly<Record<Direction, GridPoint>> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** Letterbox a grid inside its CSS size without stretching either axis. */
export function fitGrid(width: number, height: number, columns: number, rows: number) {
  if (![width, height, columns, rows].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Canvas and grid dimensions must be positive finite numbers.');
  }
  const padding = Math.min(width, height) * 0.065;
  const cell = Math.min((width - padding * 2) / columns, (height - padding * 2) / rows);
  return {
    cell,
    offsetX: (width - cell * (columns - 1)) / 2,
    offsetY: (height - cell * (rows - 1)) / 2,
  };
}

export function backingSize(width: number, height: number, ratio: number) {
  const dpr = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    width: Math.max(1, Math.round(width * dpr)),
    height: Math.max(1, Math.round(height * dpr)),
  };
}
