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

// Swappable shell colors (the anodized body editions). Only the shell changes;
// cream keys + accent buttons + screen stay fixed. body = main shell, deep = a
// darker shade (knob rim), floor = darkest (well floor, speaker + joystick holes).
export interface BodyTheme {
  name: string;
  body: string;
  deep: string;
  floor: string;
}
export const BODY_THEMES: readonly BodyTheme[] = [
  { name: 'Cosmic Blue', body: '#1f41d6', deep: '#18329f', floor: '#0c1d5e' },
  { name: 'Stealth', body: '#272b33', deep: '#171a20', floor: '#0a0c10' },
  { name: 'Coral', body: '#e8553f', deep: '#bd3c2b', floor: '#6f2018' },
  { name: 'Seafoam', body: '#2bb98f', deep: '#1d8568', floor: '#0e4839' },
  { name: 'Grape', body: '#7b46d6', deep: '#5a2fa3', floor: '#311a5e' },
];

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
