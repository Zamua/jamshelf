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

// The recessed well depth (how far the button/key panel + the screen are sunk
// below the face). Shared by Chassis (the cut) and Screen (sits in its recess).
export const WELL_DEPTH = 0.12;
export const FLOOR_Z = FRONT_Z - WELL_DEPTH;

// The App camera (composition root) is fixed at this distance + fov.
export const CAM_DIST = 7;
export const CAM_FOV = 42;

export interface PadSpec {
  degree: Degree;
  x: number;
  y: number;
  w: number;
  h: number;
  platW: number;
  platH: number;
  platDx: number;
}

// THE KEY WELL: ONE recessed rounded panel holding the WHOLE right cluster - the
// OLED, the 3 menu buttons AND the 7 keys - all rising flush from its floor (no
// separate per-button cutouts). It hugs the cluster tightly (small margin).
// Speaker + joystick + mic live on the raised land to the left.
export const KEY_WELL = { x: 0.6, y: 0.036, w: 3.14, h: 2.89 } as const;

// The 4-column grid. The 4 bottom keys, AND the 4 top cells (screen + 3 buttons)
// share these column centers + this width, so the top cells line up vertically
// with the bottom keys (just squares instead of tall rects). The 3 sharp keys
// sit at the gaps BETWEEN the columns (piano interleave).
const BLOCK = { cx: 0.6, w: 3.06, gap: 0.04 } as const;
const BLOCK_LEFT = BLOCK.cx - BLOCK.w / 2;
const BOT_W = BLOCK.w / 4;
export const KEY_W = BOT_W - BLOCK.gap; // shared cell width (square side for the top row)
export const COLS = [0, 1, 2, 3].map((i) => BLOCK_LEFT + (i + 0.5) * BOT_W);
// the 3 internal gaps between the 4 columns (where each top sharp sits)
const GAPS = [
  (COLS[0] + COLS[1]) / 2,
  (COLS[1] + COLS[2]) / 2,
  (COLS[2] + COLS[3]) / 2,
];

// Keycap depth + travel (z is keycap-group CENTER). restZ is set so the keycap
// top sits FLUSH with the case face (it does not protrude - only the joystick
// does); the lower body is hidden behind the well floor. Pressing dips it down.
export const PAD = {
  d: 0.22,
  restZ: FRONT_Z - 0.15,
  pressZ: FRONT_Z - 0.2,
} as const;

const TOP_Y = 0.33; // sharp (top) keys row
const BOT_Y = -0.705; // bottom keys row
const TOP_H = 0.66; // top row height (also the middle key's side -> a square)
const BOT_H = 1.29; // bottom row: tall
const TOP_PLAT = 0.56; // square platform size for the sharp keys

export function padSpecs(): PadSpec[] {
  const items: PadSpec[] = [];

  // bottom row: 4 tall keycaps, degrees 1,3,5,7, at the 4 columns, each with a
  // centered raised platform (a subtle 2-tier keycap).
  PAD_LAYOUT.bottom.forEach((degree, i) => {
    items.push({
      degree,
      x: COLS[i],
      y: BOT_Y,
      w: KEY_W,
      h: BOT_H,
      platW: KEY_W * 0.92,
      platH: BOT_H * 0.95,
      platDx: 0,
    });
  });

  // top row: 3 sharp keys, degrees 2,4,6. The middle is a SQUARE keycap; left and
  // right are wide rects whose square platform is offset to the INSIDE, landing
  // over the bottom gap so it reads like a piano sharp between the bottom keys.
  const midHalf = TOP_H / 2;
  const midLeft = GAPS[1] - midHalf - 0.07;
  const midRight = GAPS[1] + midHalf + 0.07;
  const tops = [
    { degree: PAD_LAYOUT.top[0], left: BLOCK_LEFT, right: midLeft, plat: GAPS[0] },
    { degree: PAD_LAYOUT.top[1], left: midLeft + 0.07, right: midRight - 0.07, plat: GAPS[1] },
    { degree: PAD_LAYOUT.top[2], left: midRight, right: BLOCK_LEFT + BLOCK.w, plat: GAPS[2] },
  ];
  tops.forEach((t) => {
    const cx = (t.left + t.right) / 2;
    items.push({
      degree: t.degree,
      x: cx,
      y: TOP_Y,
      w: t.right - t.left,
      h: TOP_H,
      platW: TOP_PLAT,
      platH: TOP_PLAT,
      platDx: t.plat - cx,
    });
  });
  return items;
}

// Top strip: 4 equal SQUARES across the top, column-aligned with the bottom keys
// (same centers + width). The LEFT cell is the OLED (its own recess); the other
// 3 are the menu buttons.
const STRIP_Y = 1.06;
export const SCREEN = { x: COLS[0], y: STRIP_Y, w: KEY_W, h: KEY_W } as const;
export const MENU = { y: STRIP_Y, size: KEY_W, gray: COLS[1], yellow: COLS[2], red: COLS[3] } as const;

// Left column (outside the well): branding, the octagon dot-speaker, the
// joystick (with a ring of 8 dots at the cardinals + diagonals), and a mic hole
// + label below it. The column x is centered between the device's left edge
// (-BODY.w/2 = -2.36) and the key well's left edge (KEY_WELL.x - KEY_WELL.w/2).
const LEFT_X = (-BODY.w / 2 + (KEY_WELL.x - KEY_WELL.w / 2)) / 2; // ~ -1.69
export const BRAND = { x: LEFT_X, y: 1.34, text: 'HiClone' } as const;
export const SPEAKER = { x: LEFT_X, y: 0.52, z: FRONT_Z, r: 0.5 } as const;
export const KNOB = { x: LEFT_X, y: -0.8, z: FRONT_Z } as const;
// The recessed joystick well: about the width of the cap, well inside the dot ring.
export const KNOB_WELL_R = 0.29;
export const JOY_DOTS = { count: 8, r: 0.46, dot: 0.022 } as const;
export const MIC = { x: LEFT_X, y: -1.4, z: FRONT_Z, r: 0.03, labelY: -1.55 } as const;
