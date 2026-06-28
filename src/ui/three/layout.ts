import { PAD_LAYOUT, type Degree } from '../../domain/music';

// All geometry constants for the modeled device, in world units. The device is
// a landscape slab facing +Z (the play view). +Y is the physical top edge of
// the slab, where the power/volume/jack/USB hardware lives (seen when the user
// orbits the device in inspect mode). Body aspect matches the real device
// (~100 x 71 mm = 1.41 : 1).
export const BODY = { w: 4.72, h: 3.35, d: 0.6 } as const;

// Front face of the slab (z of the play surface).
export const FRONT_Z = BODY.d / 2;

// The App camera (composition root) is fixed at this distance + fov. We read
// these to fit-scale the device to any viewport without fighting the OrbitControls
// dolly (which moves the camera but not the DOM size we derive the fit from).
export const CAM_DIST = 7;
export const CAM_FOV = 42;

export interface PadSpec {
  degree: Degree;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Keycap depth + travel (z is keycap CENTER, above the well floor). Width/height
// are per-pad (top row = wide-short horizontal rects, bottom = tall-narrow).
export const PAD = {
  d: 0.24,
  restZ: FRONT_Z + 0.12,
  pressZ: FRONT_Z + 0.04,
} as const;

// The pad block (the recessed key area on the right). Top 3 wide-short pads over
// bottom 4 tall-narrow pads, sharing the block width. Reading the 7 by x-position
// gives bottom, top, bottom, top ... = degrees 1..7 (the real interleave).
const BLOCK = { cx: 0.66, w: 3.18, gap: 0.1 } as const;
const BLOCK_LEFT = BLOCK.cx - BLOCK.w / 2;
const TOP_Y = 0.3;
const BOT_Y = -0.78;
const TOP_H = 0.58; // horizontal: short
const BOT_H = 1.04; // vertical: tall

export function padSpecs(): PadSpec[] {
  const items: PadSpec[] = [];
  const botW = BLOCK.w / 4;
  const topW = BLOCK.w / 3;
  // bottom row: 4 tall-narrow vertical rects, degrees 1,3,5,7
  PAD_LAYOUT.bottom.forEach((degree, i) => {
    items.push({
      degree,
      x: BLOCK_LEFT + (i + 0.5) * botW,
      y: BOT_Y,
      w: botW - BLOCK.gap,
      h: BOT_H,
    });
  });
  // top row: 3 wide-short horizontal rects, degrees 2,4,6 (interleaved between)
  PAD_LAYOUT.top.forEach((degree, i) => {
    items.push({
      degree,
      x: BLOCK_LEFT + (i + 0.5) * topW,
      y: TOP_Y,
      w: topW - BLOCK.gap,
      h: TOP_H,
    });
  });
  return items;
}

// Recessed key well that frames the pad cluster.
export const KEY_WELL = { x: BLOCK.cx, y: -0.36, w: BLOCK.w + 0.34, h: 2.05 } as const;

// Top strip (above the pads): OLED on the left, the 3 colored menu buttons to its
// right. Both sit above the pad block, clear of the well rim.
export const SCREEN = { x: -0.3, y: 1.24, z: FRONT_Z, w: 1.46, h: 0.62 } as const;
export const MENU = { y: 1.24, gray: 0.86, yellow: 1.42, red: 1.98, size: 0.46 } as const;

// Left column: octagon speaker (upper), mic pinhole (just above the joystick),
// joystick/wheel (lower).
export const SPEAKER = { x: -1.74, y: 0.5, z: FRONT_Z, r: 0.5 } as const;
export const MIC = { x: -1.74, y: -0.28, z: FRONT_Z, r: 0.035 } as const;
export const KNOB = { x: -1.74, y: -0.92, z: FRONT_Z } as const;
