// Geometry for the modeled LoopClone, in world units. A wide near-black RC-505-style loop station:
// a top control panel (branding + OLED + two big knobs + a transport row) over a lower section of
// FIVE track channels, each with an EDIT button, a fader, a stop button, a number, and the big round
// LED-ring record/play button that IS the look.

export const BODY = { w: 6.4, h: 3.0, d: 0.5 } as const;
export const FRONT_Z = BODY.d / 2;
export const BODY_RADIUS = 0.1;
export const CAM_DIST = 7.6;
export const CAM_FOV = 42;

// --- top panel ---
export const BRAND = { x: -1.72, y: 1.24, text: 'LoopClone' } as const;
export const SUBTITLE = { x: -1.72, y: 1.0, text: 'LOOP STATION' } as const;
export const OLED = { x: 0.42, y: 1.07, w: 1.3, h: 0.44 } as const;
export const KNOB_L = { x: -2.78, y: 1.02, r: 0.4 } as const;
export const KNOB_R = { x: 2.78, y: 1.02, r: 0.4 } as const;
export const ACCENT_Y = 1.42; // the red accent stripe near the top edge
export const PANEL_TOP = { y: 0.86, h: 1.5 } as const; // the recessed top-panel plate

// transport row (small round buttons across the panel center)
export const TRANSPORT = { y: 0.6, r: 0.115 } as const;
export const TRANSPORT_BTNS = ['ALL', 'UNDO', 'TAP', 'RUN'] as const;
export function transportX(i: number, n: number): number {
  const span = 1.85;
  return 0.35 - span / 2 + (i + 0.5) * (span / n);
}

// --- the 5 track channels (the lower section) ---
export const TRACKS = 5;
export const TRACK_SECTION = { y: -0.7, h: 2.0 } as const; // the recessed plate the channels sit on
export const TRACK = {
  startX: -2.4,
  spacing: 1.2,
  editXoff: -0.26,
  editY: 0.16,
  editW: 0.42,
  editH: 0.2,
  faderXoff: 0.28,
  faderY: 0.06,
  faderH: 0.42,
  faderW: 0.11,
  stopXoff: -0.26,
  stopY: -0.2,
  stopSize: 0.26,
  numXoff: 0.2,
  numY: -0.22,
  buttonY: -0.96,
  buttonR: 0.4,
} as const;
export function trackX(i: number): number {
  return TRACK.startX + i * TRACK.spacing;
}
