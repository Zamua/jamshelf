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
  d: 0.22,
  restZ: FRONT_Z + 0.1,
  pressZ: FRONT_Z + 0.03,
} as const;

// The pad block: a large, tightly-packed brick of 7 keycaps filling most of the
// right side (small gaps, like the real device). Top 3 wide-short horizontal
// pads over bottom 4 tall-narrow pads, sharing the block width. Reading the 7 by
// x-position gives bottom, top, bottom, top ... = degrees 1..7 (the interleave).
const BLOCK = { cx: 0.5, w: 3.16, gap: 0.07 } as const;
const BLOCK_LEFT = BLOCK.cx - BLOCK.w / 2;
const TOP_Y = 0.42;
const BOT_Y = -0.66;
const TOP_H = 0.74; // horizontal: short
const BOT_H = 1.3; // vertical: tall

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

// Recessed key well framing the pad cluster. Kept fully inside the body so no
// rim juts past the slab edge (a thin rim, set in Chassis).
export const KEY_WELL = { x: BLOCK.cx, y: -0.16, w: BLOCK.w + 0.18, h: 2.2 } as const;

// Top strip (above the pads): OLED on the left, the 3 colored menu buttons to its
// right. Both sit above the pad block, clear of the thin well rim.
export const SCREEN = { x: -0.34, y: 1.22, z: FRONT_Z, w: 1.4, h: 0.58 } as const;
export const MENU = { y: 1.22, gray: 0.86, yellow: 1.4, red: 1.94, size: 0.44 } as const;

// Left column (narrow): octagon speaker (upper), mic pinhole (above the joystick),
// the joystick/wheel (lower).
export const SPEAKER = { x: -1.82, y: 0.56, z: FRONT_Z, r: 0.46 } as const;
export const MIC = { x: -1.82, y: -0.14, z: FRONT_Z, r: 0.033 } as const;
export const KNOB = { x: -1.82, y: -0.82, z: FRONT_Z } as const;
