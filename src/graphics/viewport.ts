import type { GridPoint } from '../game/types';
import { fitGrid } from './geometry';
import type { ScreenRect } from './mobile-layout';

export interface View { readonly zoom: number; readonly x: number; readonly y: number }
export interface BoardSpace { readonly width: number; readonly height: number; readonly columns: number; readonly rows: number; readonly safe?: ScreenRect }
export const HOME_VIEW: View = Object.freeze({ zoom: 1, x: 0, y: 0 });
export const MAX_ZOOM = 4;
export const TAP_SLOP = 8;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function boundView(view: View, space: BoardSpace): View {
  const zoom = clamp(Number.isFinite(view.zoom) ? view.zoom : 1, 1, MAX_ZOOM);
  if (zoom === 1) return HOME_VIEW;
  const limitX = (space.safe?.width ?? space.width) * (zoom - 1) / 2;
  const limitY = (space.safe?.height ?? space.height) * (zoom - 1) / 2;
  return { zoom, x: clamp(Number.isFinite(view.x) ? view.x : 0, -limitX, limitX),
    y: clamp(Number.isFinite(view.y) ? view.y : 0, -limitY, limitY) };
}

/** All input is in local CSS pixels. DPR applies only in the canvas renderer. */
export function boardTransform(space: BoardSpace, view: View = HOME_VIEW) {
  if (space.safe) {
    const rect = space.safe;
    // Cell centers occupy the full safe width, with a fixed allowance for stroke/heads.
    // A square board stays square even on a tall phone; empty geometry isn't stretched.
    const margin = Math.min(10, Math.min(rect.width, rect.height) * .045);
    const cell = Math.min((rect.width - margin * 2) / Math.max(1, space.columns - 1),
      (rect.height - margin * 2) / Math.max(1, space.rows - 1)) * view.zoom;
    const x = rect.x + rect.width / 2 - (space.columns - 1) * cell / 2 + view.x;
    const y = rect.y + rect.height / 2 - (space.rows - 1) * cell / 2 + view.y;
    return { cell, toCSS: (point: GridPoint): GridPoint => ({ x: x + point.x * cell, y: y + point.y * cell }),
      toWorld: (point: GridPoint): GridPoint => ({ x: (point.x - x) / cell, y: (point.y - y) / cell }) };
  }
  const fit = fitGrid(space.width, space.height, space.columns, space.rows);
  const cell = fit.cell * view.zoom;
  const x = space.width / 2 + (fit.offsetX - space.width / 2) * view.zoom + view.x;
  const y = space.height / 2 + (fit.offsetY - space.height / 2) * view.zoom + view.y;
  return { cell, toCSS: (point: GridPoint): GridPoint => ({ x: x + point.x * cell, y: y + point.y * cell }),
    toWorld: (point: GridPoint): GridPoint => ({ x: (point.x - x) / cell, y: (point.y - y) / cell }) };
}

export function zoomAt(view: View, factor: number, anchor: GridPoint, space: BoardSpace): View {
  const zoom = clamp(view.zoom * factor, 1, MAX_ZOOM);
  const ratio = zoom / view.zoom;
  const centerX = space.safe ? space.safe.x + space.safe.width / 2 : space.width / 2;
  const centerY = space.safe ? space.safe.y + space.safe.height / 2 : space.height / 2;
  return boundView({ zoom, x: anchor.x - centerX - (anchor.x - centerX - view.x) * ratio,
    y: anchor.y - centerY - (anchor.y - centerY - view.y) * ratio }, space);
}
