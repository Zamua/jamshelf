import { PAD_LAYOUT, type Degree } from '../../domain/music';

// All geometry constants for the modeled device, in world units. The device is
// a landscape slab facing +Z (the play view). +Y is the physical top edge of
// the slab, where the power/volume/jack/USB hardware lives (seen when the user
// orbits the device in inspect mode).
export const BODY = { w: 6.2, h: 3.3, d: 0.62 } as const;

// Front face of the slab (z of the play surface).
export const FRONT_Z = BODY.d / 2; // 0.31

// The App camera (composition root) is fixed at this distance + fov. We read
// these to fit-scale the device to any viewport without fighting the OrbitControls
// dolly (which moves the camera but not the DOM size we derive the fit from).
export const CAM_DIST = 7;
export const CAM_FOV = 42;

export interface PadSpec {
  degree: Degree;
  x: number;
  y: number;
}

// Keycap dimensions + travel (z values are keycap CENTER, above the well floor).
export const PAD = {
  w: 0.66,
  h: 0.78,
  d: 0.26,
  restZ: FRONT_Z + 0.12, // resting keycap center
  pressZ: FRONT_Z + 0.04, // depressed keycap center
} as const;

const PAD_PITCH = 0.78;
const PAD_CX = 1.25; // horizontal center of the pad cluster (right side)
const BOTTOM_Y = -0.82;
const TOP_Y = 0.16;

// Build the 7 pad positions from the domain PAD_LAYOUT. Bottom row carries the
// odd degrees (1,3,5,7); the top row interleaves the even degrees (2,4,6) so
// each sits exactly between two bottom pads, piano-style.
export function padSpecs(): PadSpec[] {
  const items: PadSpec[] = [];
  PAD_LAYOUT.bottom.forEach((degree, i) => {
    items.push({ degree, x: (i - 1.5) * PAD_PITCH + PAD_CX, y: BOTTOM_Y });
  });
  PAD_LAYOUT.top.forEach((degree, i) => {
    items.push({ degree, x: (i - 1) * PAD_PITCH + PAD_CX, y: TOP_Y });
  });
  return items;
}

// Recessed key well that frames the pad cluster.
export const KEY_WELL = { x: PAD_CX, y: -0.33, w: 3.4, h: 2.2 } as const;

// Left-side control cluster (screen, joystick, speaker, menu buttons).
export const SCREEN = { x: -1.8, y: 0.98, z: FRONT_Z } as const;
export const KNOB = { x: -2.45, y: -0.2, z: FRONT_Z } as const;
export const SPEAKER = { x: -1.05, y: -0.2, z: FRONT_Z, r: 0.58 } as const;
export const MENU = {
  y: -1.2,
  gray: -2.55,
  yellow: -1.9,
  red: -1.25,
} as const;
