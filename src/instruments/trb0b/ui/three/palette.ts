import { VOICES, type DrumVoice } from '../../domain/sequencer';

// The TR-B0B palette (hex), faithful to the TR-808: a dark charcoal body with orange accents, a
// cream START/STOP button, and the iconic 16 step buttons colored in groups of 4 (red/orange/
// yellow/white). Single source of truth for the 3D lane.
export const PALETTE = {
  body: '#2b2d31',
  bodyHi: '#3a3d42',
  bodyEdge: '#1a1b1e',
  panel: '#232529', // recessed panel areas
  orange: '#e8823a', // the accent / branding
  orangeDim: '#8a4f24',
  cream: '#e7dcc0', // START/STOP button
  creamHi: '#f2ebd6',
  ink: '#d6d8db', // light labels on the charcoal
  inkDim: '#8b8d92',
  led: '#ff6a3a', // step LED lit
  ledOff: '#3a2118',
  playhead: '#ffd27a', // the running playhead glow
  // the 4 step-button group colors (0-3 red, 4-7 orange, 8-11 yellow, 12-15 white)
  stepRed: '#d63a2f',
  stepOrange: '#e0803a',
  stepYellow: '#e3c23c',
  stepWhite: '#dcd8cc',
  stepDim: 0.5, // how much to darken an inactive step cap
} as const;

// The color group for a step index (groups of 4).
export function stepColor(step: number): string {
  const g = Math.floor(step / 4) % 4;
  return [PALETTE.stepRed, PALETTE.stepOrange, PALETTE.stepYellow, PALETTE.stepWhite][g];
}

// Order helper (kept here so the UI never re-derives voice order).
export const VOICE_ORDER: readonly DrumVoice[] = VOICES;

// Dim a hex color toward gray (for inactive caps / power-off).
export function dim(hex: string, amount = 0.5): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c * (1 - amount) + 60 * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
