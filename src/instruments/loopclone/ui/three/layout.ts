// Geometry for the modeled LoopClone, in world units. A wide near-black RC-505-style loop station:
// a DENSE top control panel (branding, a separated OLED, a cluster of knobs, colored+labeled
// transport, INPUT/TRACK FX) over five track channels, each with a calm EDIT, a prominent fader, a
// stop, a number, and the big round LED-ring record/play button that IS the look. v2: nothing
// overlaps (the wordmark and OLED have their own space) and the top panel is properly organized.

export const BODY = { w: 6.4, h: 3.0, d: 0.5 } as const;
export const FRONT_Z = BODY.d / 2;
export const BODY_RADIUS = 0.1;
export const CAM_DIST = 7.6;
export const CAM_FOV = 42;

// --- top panel plate + the divider that separates it from the track section ---
export const PANEL_TOP = { y: 0.92, h: 1.4 } as const;
export const ACCENT_Y = 1.44;
export const DIVIDER_Y = 0.44;

// branding (top strip): wordmark + "LOOP STATION" on the SAME line (right of it), so the knob row
// below is clear. Nothing overlaps.
export const BRAND = { x: -2.9, y: 1.26, size: 0.21, text: 'LoopClone' } as const;
export const SUBTITLE = { x: -1.32, y: 1.24, size: 0.082, text: 'LOOP STATION' } as const;

// the OLED (top-center, its own space, no overlap with the wordmark or knobs)
export const OLED = { x: 0.28, y: 0.98, w: 1.36, h: 0.42 } as const;

// knob cluster (below the wordmark line): big mic-in (left) + two small level knobs, a memory knob
// by the OLED, big out (right)
export const KNOB_MIC = { x: -2.76, y: 0.86, r: 0.16 } as const;
export const KNOB_IN = { x: -2.2, y: 0.88, r: 0.093 } as const;
export const KNOB_OUT = { x: -1.85, y: 0.88, r: 0.093 } as const;
export const KNOB_MEM = { x: 1.32, y: 0.96, r: 0.105 } as const;
export const KNOB_OUTPUT = { x: 2.76, y: 0.86, r: 0.16 } as const;

// transport row (center, colored + labeled round buttons)
export const TRANSPORT_R = 0.096;
export const TRANSPORT = [
  { label: 'ALL', x: -0.62, y: 0.56, kind: 'gray' },
  { label: 'UNDO', x: -0.24, y: 0.56, kind: 'red' },
  { label: 'TAP', x: 0.28, y: 0.56, kind: 'green' },
  { label: 'RUN', x: 0.66, y: 0.56, kind: 'green' },
] as const;

// INPUT FX (left) + TRACK FX (right): a small label + three dots (A lit)
export const INPUT_FX = { labelX: -2.62, labelY: 0.66, dotY: 0.53, dotX: [-2.84, -2.62, -2.4] } as const;
export const TRACK_FX = { labelX: 2.6, labelY: 0.66, dotY: 0.53, dotX: [2.38, 2.6, 2.82] } as const;

// --- the 5 track channels (below the divider) ---
export const TRACKS = 5;
export const TRACK_SECTION = { y: -0.72, h: 1.9 } as const;
export const TRACK = {
  startX: -2.4,
  spacing: 1.2,
  editXoff: -0.26,
  editY: 0.28,
  editW: 0.42,
  editH: 0.16,
  faderXoff: 0.27,
  faderY: 0.06,
  faderH: 0.56,
  faderW: 0.15,
  stopXoff: -0.26,
  stopY: -0.02,
  stopSize: 0.24,
  numXoff: -0.04,
  numY: -0.32,
  buttonY: -1.04,
  buttonR: 0.42,
} as const;
export function trackX(i: number): number {
  return TRACK.startX + i * TRACK.spacing;
}
