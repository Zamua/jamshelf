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
  // A slightly-raised platform layered on the keycap face. For top (sharp) keys
  // this is an inset square offset to the inside so it reads as a piano sharp
  // sitting over the gap between two bottom keys.
  platW: number;
  platH: number;
  platDx: number;
}

// THE WELL: one large recessed rounded panel on the right ~2/3 of the face. It
// holds the 3 menu buttons (top strip) AND the 7 keys. The OLED is NOT in this
// well: it sits in its OWN small square recess at the top-left, and the well is
// sculpted (notched) around it. The speaker + joystick + mic live on the raised
// blue land to the well's left.
export const WELL = { x: 0.6, y: 0.0, w: 3.3, h: 2.9 } as const;
// interior bounds: x [-1.05 .. 2.25], y [-1.45 .. 1.45]

// Keycap depth + travel (z is keycap-group CENTER, above the well floor).
export const PAD = {
  d: 0.22,
  restZ: FRONT_Z + 0.1,
  pressZ: FRONT_Z + 0.03,
} as const;

// The pad block fills the well below the top strip.
const BLOCK = { cx: 0.6, w: 3.06, gap: 0.06 } as const;
const BLOCK_LEFT = BLOCK.cx - BLOCK.w / 2;
const TOP_Y = 0.33;
const BOT_Y = -0.705;
const TOP_H = 0.66; // top row height (also the middle key's side -> a square)
const BOT_H = 1.29; // bottom row: tall

// Square platform size for the top (sharp) keys.
const TOP_PLAT = 0.46;

export function padSpecs(): PadSpec[] {
  const items: PadSpec[] = [];
  const botW = BLOCK.w / 4;

  // bottom row: 4 tall keycaps, degrees 1,3,5,7, each with a centered raised
  // platform (a subtle 2-tier keycap).
  const botCenters: number[] = [];
  PAD_LAYOUT.bottom.forEach((degree, i) => {
    const cx = BLOCK_LEFT + (i + 0.5) * botW;
    botCenters.push(cx);
    const kw = botW - BLOCK.gap;
    items.push({
      degree,
      x: cx,
      y: BOT_Y,
      w: kw,
      h: BOT_H,
      platW: kw * 0.82,
      platH: BOT_H * 0.9,
      platDx: 0,
    });
  });

  // the 3 internal gaps between the 4 bottom keys: where each top sharp sits.
  const gaps = [
    (botCenters[0] + botCenters[1]) / 2,
    (botCenters[1] + botCenters[2]) / 2,
    (botCenters[2] + botCenters[3]) / 2,
  ];

  // top row: 3 keys, degrees 2,4,6. The middle is a SQUARE keycap; the left and
  // right are wide rects whose square platform is offset to the INSIDE, landing
  // over the bottom gap so it reads like a piano sharp between the bottom keys.
  const midHalf = TOP_H / 2;
  const midLeft = gaps[1] - midHalf - 0.07;
  const midRight = gaps[1] + midHalf + 0.07;
  const tops = [
    { degree: PAD_LAYOUT.top[0], left: BLOCK_LEFT, right: midLeft, plat: gaps[0] },
    { degree: PAD_LAYOUT.top[1], left: midLeft + 0.07, right: midRight - 0.07, plat: gaps[1] },
    { degree: PAD_LAYOUT.top[2], left: midRight, right: BLOCK_LEFT + BLOCK.w, plat: gaps[2] },
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

// Top strip: 4 equal-sized cells across the top, tight gaps. The LEFT cell is
// the OLED (its own recess); the other 3 are the menu buttons. Same size so it
// reads as "4 equal buttons" with the leftmost being the screen.
const STRIP_Y = 1.04;
const CELL = 0.64;
export const SCREEN = { x: -0.42, y: STRIP_Y, w: CELL, h: CELL } as const;
export const MENU = { y: STRIP_Y, size: CELL, gray: 0.32, yellow: 1.06, red: 1.8 } as const;

// Left column (outside the well): branding, the octagon dot-speaker, the
// joystick (with a ring of 8 dots), and a mic hole + label below it.
export const BRAND = { x: -1.62, y: 1.34, text: 'HiClone' } as const;
export const SPEAKER = { x: -1.6, y: 0.52, z: FRONT_Z, r: 0.46 } as const;
export const KNOB = { x: -1.6, y: -0.8, z: FRONT_Z } as const;
export const JOY_DOTS = { count: 8, r: 0.46, dot: 0.022 } as const;
export const MIC = { x: -1.6, y: -1.4, z: FRONT_Z, r: 0.03, labelY: -1.55 } as const;
