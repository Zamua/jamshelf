// The StyloClone palette (hex). Faithful to the cream-and-silver 1968 Stylophone with the
// classic red wordmark. Single source of truth for the 3D lane.
export const PALETTE = {
  body: '#e7dfc8', // cream ABS shell
  bodyHi: '#f2ecd8',
  bodyShadow: '#c9c0a4',
  plate: '#c7ccd2', // brushed-silver keyboard plate
  plateEdge: '#9aa0a8',
  keySilver: '#d9dde2', // natural key contact
  keySilverHi: '#eef1f4',
  keyDark: '#31353b', // accidental (black) key contact
  keyDarkHi: '#474c54',
  gap: '#232529', // dark gaps between contacts (the PCB etch)
  red: '#d94f3d', // the STYLOPHONE-style wordmark
  redDim: '#7c3129',
  ink: '#33312a', // dark labels on the cream
  glow: '#ffd9a0', // the pressed-key highlight
  switchBody: '#2a2c30',
  switchNub: '#e7dfc8',
  potBody: '#2a2c30',
  potIndicator: '#e7dfc8',
  stylus: '#26282c',
  cord: '#3a3d42',
} as const;

// Dim a hex color toward gray when the device is powered off.
export function dim(hex: string, amount = 0.55): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c * (1 - amount) + 128 * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
