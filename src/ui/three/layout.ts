import { PAD_LAYOUT, type Degree } from '../../domain/music';

// All geometry constants for the modeled device, in world units. The device is
// a landscape slab facing +Z (the play view). +Y is the physical top edge of
// the slab, where the power/volume/jack/USB hardware lives (seen when the user
// orbits the device in inspect mode). Body aspect matches the real device
// (~100 x 71 mm = 1.41 : 1).
export const BODY = { w: 4.72, h: 3.35, d: 0.62 } as const;

// Front face of the slab (z of the play surface).
export const FRONT_Z = BODY.d / 2;

// Body bevel: steep, barely-rounded edges (the real device has near-vertical
// sides with only a small chamfer). Keep this small.
export const BODY_RADIUS = 0.1;

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

// THE WELL: one large recessed rounded panel on the right ~2/3 of the face. It
// holds the OLED (a small square carve-out, top-left), the 3 menu buttons (top
// strip) AND the 7 keys (filling the rest), exactly like the real device. The
// speaker + mic + joystick live OUTSIDE it, in the left column.
export const WELL = { x: 0.6, y: 0.0, w: 3.3, h: 2.9 } as const;
// interior bounds: x [-1.05 .. 2.25], y [-1.45 .. 1.45]

// Keycap depth + travel (z is keycap CENTER, above the well floor). Width/height
// are per-pad (top row = wide-short horizontal rects, bottom = tall-narrow).
export const PAD = {
  d: 0.22,
  restZ: FRONT_Z + 0.1,
  pressZ: FRONT_Z + 0.03,
} as const;

// The pad block fills the well below the top strip: a tight brick of 7 keycaps.
// Top 3 wide-short horizontal pads over bottom 4 tall-narrow pads, sharing the
// block width. Reading the 7 by x gives bottom, top, bottom, top ... = degrees
// 1..7 (the piano interleave).
const BLOCK = { cx: 0.6, w: 3.06, gap: 0.06 } as const;
const BLOCK_LEFT = BLOCK.cx - BLOCK.w / 2;
const TOP_Y = 0.34;
const BOT_Y = -0.7;
const TOP_H = 0.66; // horizontal: short
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

// Top strip of the well (above the pads): the square OLED on the left, then the
// 3 colored menu buttons evenly spaced across to the well's right edge. Big
// buttons, tight gaps. y is shared by the screen + all three buttons.
const STRIP_Y = 1.06;
export const SCREEN = { x: -0.6, y: STRIP_Y, z: FRONT_Z, w: 0.64, h: 0.64 } as const;
export const MENU = { y: STRIP_Y, size: 0.64, gray: 0.2, yellow: 1.0, red: 1.8 } as const;

// Left column (outside the well): the octagon dot-speaker (upper), the mic
// pinhole (above the joystick), the joystick/wheel (lower). Inset from the left
// edge so nothing reads as "falling off."
export const SPEAKER = { x: -1.6, y: 0.5, z: FRONT_Z, r: 0.56 } as const;
export const MIC = { x: -1.6, y: -0.3, z: FRONT_Z, r: 0.03 } as const;
export const KNOB = { x: -1.6, y: -0.92, z: FRONT_Z } as const;
