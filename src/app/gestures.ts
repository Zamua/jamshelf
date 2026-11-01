import { SPIN_TILT_MAX, SPIN_TILT_MIN, type Spin } from '../stage/motion';

// The pure math behind the stage's pointer gestures; the hooks in useGestures.ts own the listeners.

export interface PointerSample {
  x: number;
  y: number;
  t: number; // event timestamp, ms
}

const TURN_SENS = 0.01; // radians of turn per px dragged horizontally
const TILT_SENS = 0.008; // radians of tilt per px dragged vertically
const VELOCITY_SMOOTHING = 0.4; // share of the previous velocity kept per move

// One drag-to-spin move: turn + tilt (clamped), and an angular velocity from the real event timing,
// so a flick still carries its speed on release (a frame-sampled velocity would read ~0 there).
export function dragSpin(spin: Spin, from: PointerSample, to: PointerSample): Spin {
  const dyaw = (to.x - from.x) * TURN_SENS;
  const x = Math.max(SPIN_TILT_MIN, Math.min(SPIN_TILT_MAX, spin.x + (to.y - from.y) * TILT_SENS));
  const dpitch = x - spin.x;
  const dtS = (to.t - from.t) / 1000;
  const blend = (v: number, d: number) => (dtS > 0 ? v * VELOCITY_SMOOTHING + (d / dtS) * (1 - VELOCITY_SMOOTHING) : v);
  return { ...spin, x, y: spin.y + dyaw, vx: blend(spin.vx, dpitch), vy: blend(spin.vy, dyaw) };
}

const CAROUSEL_DRAG_PX = 240; // px of horizontal drag per one carousel step
const CAROUSEL_OVERSCROLL = 0.35;

// The carousel position while dragging: follows the finger with a little overscroll past either end.
export function carouselDragPos(startPos: number, dx: number, count: number): number {
  const next = startPos - dx / CAROUSEL_DRAG_PX;
  return Math.max(-CAROUSEL_OVERSCROLL, Math.min(count - 1 + CAROUSEL_OVERSCROLL, next));
}

// Where the carousel settles on release: the nearest instrument.
export function snapCarousel(pos: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.round(pos)));
}

const SWIPE_MARGIN = 0.24; // share of the viewport height at the top and bottom a rig swipe starts in
const SWIPE_MIN_PX = 55;

// A rig swipe must start in the empty top/bottom bands, so a drag ON the instrument still plays it.
export function inSwipeMargin(y: number, viewportHeight: number): boolean {
  const margin = viewportHeight * SWIPE_MARGIN;
  return y < margin || y > viewportHeight - margin;
}

// The device a horizontal swipe moves focus to: the nearest one in that direction (left = next)
// that `canTake` allows, or null when the swipe is too small, too vertical, or nothing is free.
export function rigSwipeTarget(order: readonly string[], focused: string, dx: number, dy: number, canTake: (id: string) => boolean): string | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return null;
  const step = dx < 0 ? 1 : -1;
  const cur = order.indexOf(focused);
  const n = order.length;
  for (let k = 1; k < n; k++) {
    const id = order[(((cur + step * k) % n) + n) % n];
    if (canTake(id)) return id;
  }
  return null;
}
