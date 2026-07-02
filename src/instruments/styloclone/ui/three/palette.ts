// The StyloClone palette (hex). Faithful to the black-and-silver 1968/reissue Stylophone: a
// black body, a big silver slat speaker grille, a black logo badge, and a flat tan/silver etched
// metal keyboard on a white lower strip. Single source of truth for the 3D lane.
export const PALETTE = {
  body: '#232426', // black ABS shell
  bodyHi: '#33353a',
  bodyEdge: '#151517',
  grilleDark: '#1c1d1f', // grille background between the slats
  slat: '#c9cdd2', // the silver grille slats
  slatHi: '#e7eaee',
  badge: '#17181a', // the logo badge
  badgeText: '#f3f5f8', // white script wordmark
  strip: '#eef0f2', // the white lower panel that holds the keyboard + switches
  stripEdge: '#c3c7cc',
  plate: '#0d0d0e', // the keyboard's etched black background (the lines between keys)
  key: '#c8b98f', // the flat tan/silver key metal (naturals AND sharps, same color)
  keyHi: '#ddd0aa',
  keyEdge: '#9a8c66',
  keyNum: '#2a2a2c', // the printed key numbers
  glow: '#ffd27a', // the pressed-key highlight overlay
  ink: '#e9ebee', // labels on the black body
  inkDim: '#8b8d92',
  switchTrack: '#0e0e10',
  switchNub: '#c9cdd2',
  stylus: '#1a1b1d',
  stylusTip: '#c9a24a', // the brass stylus tip
  cord: '#26272a',
} as const;

// Dim a hex color toward gray when the device is powered off.
export function dim(hex: string, amount = 0.5): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c * (1 - amount) + 110 * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
