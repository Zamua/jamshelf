// Geometry for the modeled LoopClone, in world units. A wide near-black RC-505-style loop station:
// a LIGHT top control panel over a DARK track section, split at ONE clean boundary. Hard rule: every
// element is FULLY on one panel or the other - nothing straddles the boundary. The top panel holds
// branding + a separated OLED + a knob cluster + colored/labeled transport + INPUT/TRACK FX; the
// track section holds the five channels (EDIT, fader, stop, number, and the big LED-ring button).

export const BODY = { w: 6.4, h: 3.0, d: 0.5 } as const;
export const FRONT_Z = BODY.d / 2;
export const BODY_RADIUS = 0.1;
export const CAM_DIST = 7.6;
export const CAM_FOV = 42;

// THE boundary. Light panel is everything above it; dark track section everything below. The two
// plates meet exactly here and no element crosses it.
export const BOUNDARY_Y = 0.32;
export const TOP_EDGE = 1.58;
export const BOTTOM_EDGE = -1.5;
export const ACCENT_Y = 1.44;
export const PANEL_TOP = { y: (BOUNDARY_Y + TOP_EDGE) / 2, h: TOP_EDGE - BOUNDARY_Y } as const;
export const TRACK_SECTION = { y: (BOUNDARY_Y + BOTTOM_EDGE) / 2, h: BOUNDARY_Y - BOTTOM_EDGE } as const;

// --- LIGHT top panel (everything here is ABOVE BOUNDARY_Y) ---
export const BRAND = { x: -2.9, y: 1.28, size: 0.21, text: 'LoopClone' } as const;
export const SUBTITLE = { x: -1.32, y: 1.26, size: 0.082, text: 'LOOP STATION' } as const;
export const OLED = { x: 0.28, y: 1.0, w: 1.36, h: 0.42 } as const;
export const KNOB_MIC = { x: -2.76, y: 0.9, r: 0.16 } as const;
export const KNOB_IN = { x: -2.2, y: 0.92, r: 0.093 } as const;
export const KNOB_OUT = { x: -1.85, y: 0.92, r: 0.093 } as const;
export const KNOB_MEM = { x: 1.32, y: 0.98, r: 0.105 } as const;
export const KNOB_OUTPUT = { x: 2.76, y: 0.9, r: 0.16 } as const;

export const TRANSPORT_R = 0.094;
export const TRANSPORT = [
  { label: 'ALL', x: -0.62, y: 0.56, kind: 'gray' },
  { label: 'UNDO', x: -0.24, y: 0.56, kind: 'red' },
  { label: 'TAP', x: 0.28, y: 0.56, kind: 'green' },
  { label: 'RUN', x: 0.66, y: 0.56, kind: 'green' },
] as const;
export const INPUT_FX = { labelX: -2.62, labelY: 0.58, dotY: 0.45, dotX: [-2.84, -2.62, -2.4] } as const;
export const TRACK_FX = { labelX: 2.6, labelY: 0.58, dotY: 0.45, dotX: [2.38, 2.6, 2.82] } as const;

// --- DARK track section (everything here is BELOW BOUNDARY_Y) ---
export const TRACKS = 5;
export const TRACK = {
  startX: -2.4,
  spacing: 1.2,
  editXoff: -0.26,
  editY: 0.14,
  editW: 0.42,
  editH: 0.15,
  faderXoff: 0.27,
  faderY: -0.05,
  faderH: 0.46,
  faderW: 0.15,
  stopXoff: -0.26,
  stopY: -0.15,
  stopSize: 0.22,
  numXoff: -0.04,
  numY: -0.46,
  buttonY: -1.0,
  buttonR: 0.42,
} as const;
export function trackX(i: number): number {
  return TRACK.startX + i * TRACK.spacing;
}
