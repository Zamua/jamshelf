// The stage's motion state shared with the HTML chrome that drives it: the inspect spin, the shelf
// carousel, and the timings the chrome waits on. Mutated in place by both sides, read every frame.

// Drag-to-spin while inspecting: x = tilt, y = turn (radians), with angular velocity for the coast.
export interface Spin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dragging: boolean;
}

export const restingSpin = (): Spin => ({ x: 0, y: 0, vx: 0, vy: 0, dragging: false });

// The live carousel position: `pos` is the fractional centered index (moves with the finger),
// `target` the integer it snaps to, `dragging` gates the snap ease.
export interface Carousel {
  pos: number;
  target: number;
  dragging: boolean;
}

export const SPIN_TILT_MIN = -1.2;
export const SPIN_TILT_MAX = 1.2;

export const FLOAT_DURATION = 1.2; // seconds for a device to float from the shelf to the desk
