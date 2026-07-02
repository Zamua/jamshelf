import { STEPS, VOICES } from '../../domain/sequencer';

// Geometry for the modeled TR-B0B, in world units. A wide charcoal 808-style box: TEMPO knob +
// START/STOP on the left, branding top-right, a row of 8 voice-select buttons, and the iconic row
// of 16 colored step buttons along the bottom.
export const BODY = { w: 5.4, h: 3.0, d: 0.5 } as const;
export const FRONT_Z = BODY.d / 2;
export const BODY_RADIUS = 0.1;
export const CAM_DIST = 7;
export const CAM_FOV = 42;

export const BRAND = { x: 1.35, y: 1.2, text: 'TR-B0B' } as const;
export const SUBTITLE = { x: 1.35, y: 0.9, text: 'RHYTHM COMPOSER' } as const;

export const TEMPO = { x: -2.2, y: 0.82, r: 0.4 } as const;
export const PLAY = { x: -2.2, y: -0.55, w: 0.74, h: 0.6 } as const; // START/STOP

// the 8 voice-select buttons (top row)
export const VOICE_ROW = { y: 0.45, startX: -1.35, spanW: 3.85, w: 0.44, h: 0.42 } as const;
export function voiceX(i: number): number {
  return VOICE_ROW.startX + (i + 0.5) * (VOICE_ROW.spanW / VOICES.length);
}

// the 16 step buttons (bottom row) + their LED (above) and number (below)
export const STEP_ROW = { y: -0.98, startX: -1.5, spanW: 4.0, w: 0.2, h: 0.5, ledY: -0.6, numY: -1.32 } as const;
export function stepX(i: number): number {
  return STEP_ROW.startX + (i + 0.5) * (STEP_ROW.spanW / STEPS);
}
