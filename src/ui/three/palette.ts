import { Color } from 'three';

// Cosmic Blue HiChord palette (hex). Single source of truth for the 3D lane.
export const PALETTE = {
  bodyBlue: '#1f41d6',
  rimHi: '#5e7dff',
  bodyDeep: '#18329f',
  keyWell: '#122a86',
  wellFloor: '#0c1d5e',
  cream: '#ece4cf',
  creamHi: '#f7f1e2',
  creamShadow: '#cabf9f',
  gray: '#c7cbd0',
  yellow: '#f3c33f',
  red: '#ec3a2c',
  oled: '#07080a',
  amber: '#ffb638',
  speakerDot: '#0b1a63',
} as const;

// Neutral the device drifts toward when powered off (desaturate + darken).
const OFF_GRAY = new Color('#34373d');

// Blend a color toward the off-gray for the power-off look. amount 0..1.
export function dim(hex: string, amount = 0.62): string {
  return new Color(hex).lerp(OFF_GRAY, amount).getStyle();
}

// Pick the live color or its dimmed variant depending on power.
export function powerColor(hex: string, power: boolean, amount = 0.62): string {
  return power ? hex : dim(hex, amount);
}
