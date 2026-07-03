import type { TrackState } from '../../domain/loopStation';

// The LoopClone palette, faithful to the RC-505 loop station: a near-black body with a red accent,
// a small OLED, and the signature big round record/play buttons whose LED RING is the whole look -
// green playing, red recording, amber overdub, dark empty. Single source of truth for the 3D lane.
export const PALETTE = {
  body: '#191a1d', // near-black chassis
  bodyHi: '#26282c',
  panel: '#141518', // the darker recessed panels (top + track section)
  panelHi: '#202226',
  red: '#e0453a', // the accent / branding / record
  redDim: '#7a2a24',
  ink: '#d6d8db', // light labels
  inkDim: '#7d8085',
  oledBg: '#0a1410', // the OLED glass
  oledInk: '#9be8c8', // the OLED text (cool green-white)
  // the LED-ring states
  ledGreen: '#37d16a', // playing
  ledRed: '#ff4a3a', // recording
  ledAmber: '#f0a83a', // overdub
  ledOff: '#2a2c30', // empty / stopped ring base
  faderTrack: '#0e0f11',
  faderCap: '#c9ccd1',
} as const;

// The LED-ring colour + how brightly it glows for a track state.
export function ringColor(state: TrackState): string {
  switch (state) {
    case 'recording':
      return PALETTE.ledRed;
    case 'playing':
      return PALETTE.ledGreen;
    case 'overdub':
      return PALETTE.ledAmber;
    case 'stopped':
      return PALETTE.ledGreen; // a dim green outline (glow is low)
    case 'empty':
      return PALETTE.ledOff;
  }
}
export function ringGlow(state: TrackState): number {
  switch (state) {
    case 'recording':
    case 'playing':
    case 'overdub':
      return 1.4;
    case 'stopped':
      return 0.25;
    case 'empty':
      return 0.0;
  }
}

// Dim a hex color toward gray (inactive caps / power-off).
export function dim(hex: string, amount = 0.5): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c * (1 - amount) + 55 * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
