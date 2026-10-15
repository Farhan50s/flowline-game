import type { GridPoint } from '../game/types';
import { boundView, TAP_SLOP, zoomAt } from '../graphics/viewport';
import type { BoardSpace, View } from '../graphics/viewport';

interface Press { start: GridPoint; point: GridPoint; began: number; arrowId?: string; ambiguous: boolean }
export interface HoldOptions {
  readonly preview: (id: string | undefined) => void;
  readonly ready: () => boolean;
  readonly thresholdMs?: number;
  readonly now?: () => number;
}
/** Pointer-independent recognizer, shared by touch and mouse. A gesture can never revert to a tap. */
export class BoardGesture {
  private readonly pointers = new Map<number, Press>();
  private suppressed = false;
  private held = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private view: View, private space: BoardSpace, private readonly hold?: HoldOptions) {}
  private now() { return this.hold?.now?.() ?? performance.now(); }
  private clearHold() { clearTimeout(this.timer); this.timer = undefined; this.hold?.preview(undefined); }
  has(id: number) { return this.pointers.has(id); }
  pointerIds(): readonly number[] { return [...this.pointers.keys()]; }
  configure(view: View, space: BoardSpace) { this.cancel(); this.view = view; this.space = space; }
  down(id: number, point: GridPoint, arrowId?: string, ambiguous = false) {
    this.clearHold();
    this.pointers.set(id, { start: point, point, began: this.now(), ambiguous, ...(arrowId ? { arrowId } : {}) });
    if (this.pointers.size > 1) this.suppressed = true;
    if (this.hold && !this.suppressed && this.pointers.size === 1) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        const press = this.pointers.get(id);
        if (!press || this.suppressed || this.pointers.size !== 1) return;
        // Even an empty/ambiguous long press is never released as a tap.
        this.held = true;
        if (this.hold!.ready() && press.arrowId) this.hold!.preview(press.arrowId);
      }, this.hold.thresholdMs ?? 220);
    }
  }
  move(id: number, point: GridPoint): View {
    const press = this.pointers.get(id);
    if (!press) return this.view;
    const before = [...this.pointers.values()].slice(0, 2).map(p => p.point);
    if (Math.hypot(point.x - press.start.x, point.y - press.start.y) > TAP_SLOP) { this.suppressed = true; this.clearHold(); }
    press.point = point;
    const after = [...this.pointers.values()].slice(0, 2).map(p => p.point);
    if (before.length === 2) {
      const center = (p: GridPoint[]) => ({ x: (p[0]!.x + p[1]!.x) / 2, y: (p[0]!.y + p[1]!.y) / 2 });
      const distance = (p: GridPoint[]) => Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
      const a = center(before), b = center(after);
      const zoomed = zoomAt(this.view, distance(after) / Math.max(1, distance(before)), a, this.space);
      this.view = boundView({ ...zoomed, x: zoomed.x + b.x - a.x, y: zoomed.y + b.y - a.y }, this.space);
    } else if (this.suppressed && this.view.zoom > 1) {
      this.view = boundView({ ...this.view, x: this.view.x + point.x - before[0]!.x,
        y: this.view.y + point.y - before[0]!.y }, this.space);
    }
    return this.view;
  }
  up(id: number, point: GridPoint): GridPoint | undefined {
    const press = this.pointers.get(id);
    const elapsed = press ? this.now() - press.began : 0;
    const tap = press && !this.held && !this.suppressed && this.pointers.size === 1
      && (!this.hold || elapsed < (this.hold.thresholdMs ?? 220))
      && Math.hypot(point.x - press.start.x, point.y - press.start.y) <= TAP_SLOP ? (press.ambiguous ? press.start : point) : undefined;
    this.clearHold();
    this.pointers.delete(id);
    if (!this.pointers.size) { this.suppressed = false; this.held = false; }
    return tap;
  }
  cancel() { this.clearHold(); this.pointers.clear(); this.suppressed = false; this.held = false; }
}
