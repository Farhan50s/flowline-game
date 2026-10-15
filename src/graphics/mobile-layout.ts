import type { GridPoint } from '../game/types';

export interface ScreenRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface SafeInsets { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
export const NO_INSETS: SafeInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
const inset = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Shared by the DOM overlays, renderer, hit testing, pinch anchors and pan limits. CSS pixels only. */
export function gameplayLayout(width: number, height: number, input: SafeInsets = NO_INSETS) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw new RangeError('Viewport must have positive finite dimensions.');
  const top = inset(input.top), right = inset(input.right), bottom = inset(input.bottom), left = inset(input.left);
  const usableWidth = Math.max(1, width - left - right), usableHeight = Math.max(1, height - top - bottom);
  const landscape = usableWidth > usableHeight * 1.35 && usableHeight < 540;
  const safe: ScreenRect = landscape
    ? { x: left + 112, y: top + 16, width: Math.max(1, usableWidth - 200), height: Math.max(1, usableHeight - 32) }
    : { x: left + 16, y: top + 72, width: Math.max(1, usableWidth - 32), height: Math.max(1, usableHeight - 168) };
  const hud: ScreenRect = landscape
    ? { x: left + 12, y: top + 12, width: 92, height: Math.min(192, usableHeight - 24) }
    : { x: left + 12, y: top + 8, width: Math.max(1, usableWidth - 24), height: 56 };
  const controls: ScreenRect = landscape
    ? { x: width - right - 72, y: top + (usableHeight - 132) / 2, width: 56, height: 132 }
    : { x: left + (usableWidth - 132) / 2, y: height - bottom - 72, width: 132, height: 56 };
  return { safe, hud, controls, landscape };
}

export function containsPoint(rect: ScreenRect, point: GridPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function lineStyle(cell: number) {
  return { stroke: Math.max(1.8, Math.min(3.1, cell * .078)), head: Math.max(4.2, Math.min(7, cell * .17)),
    corner: Math.max(2, Math.min(7, cell * .13)) };
}
