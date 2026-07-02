import { KEYS, keyRow, type Midi } from '../../domain/keyboard';

// All geometry for the modeled StyloClone, in world units. Faithful to the black-and-silver
// 1968/reissue Stylophone: a black landscape slab whose top ~55% is a silver slat speaker grille
// with a black logo badge; a middle stylus channel; and a white lower strip holding the POWER +
// VIBRATO switches (left) and the FLAT etched metal keyboard (a numbered plate, NOT raised keys).
export const BODY = { w: 4.9, h: 3.0, d: 0.5 } as const;

export const FRONT_Z = BODY.d / 2;
export const BODY_RADIUS = 0.1;

export const CAM_DIST = 7;
export const CAM_FOV = 42;

// The silver slat speaker grille (top), the black logo badge on it, the stylus channel, the white
// lower strip, the two switches, and the keyboard plate.
export const GRILLE = { x: 0, y: 0.62, w: 4.5, h: 1.5 } as const;
export const BADGE = { x: 0.98, y: 0.96, w: 1.92, h: 0.44, text: 'StyloClone' } as const;
export const CHANNEL = { x: 0, y: -0.4, w: 4.5, h: 0.32 } as const; // stylus rests here
export const STRIP = { x: 0, y: -1.06, w: 4.72, h: 0.92 } as const; // white lower panel
export const POWER = { x: -2.06, y: -1.0, w: 0.24, h: 0.56 } as const; // vertical slide switch
export const VIBRATO = { x: -1.52, y: -1.0, w: 0.24, h: 0.56 } as const; // vertical slide switch
export const KEYBOARD = { x: 0.5, y: -1.04, w: 3.4, h: 0.86 } as const; // the flat etched plate

// The tethered stylus: rests horizontally in the channel, brass tip pointing right.
export const STYLUS = { x: 0.45, y: CHANNEL.y, len: 2.7, r: 0.055 } as const;

// A single key cell on the flat plate: its outline polygon + hit box (both in NORMALIZED keyboard
// -panel coords, x right 0..1, y UP 0..1) plus the printed number. Naturals are the numbered
// bottom row (1..12); sharps are the pentagon tabs offset above (1.5, 3.5, 4.5, ...). All the
// same flat metal color - the black etched lines between them are the plate showing through.
export interface KeyCell {
  midi: Midi;
  kind: 'natural' | 'sharp';
  label: string;
  poly: [number, number][]; // outline for the texture
  hit: { x: number; y: number; w: number; h: number }; // bounding box for the touch mesh
}

// The key bed occupies the middle vertical band of the panel; the number rows sit in the margins.
const BED_Y0 = 0.16;
const BED_Y1 = 0.82;
const COLW = 1 / 12;
const GAP = 0.006; // black etch gap (normalized x)
// Which naturals (0-based) have a sharp after them - the chromatic pattern of A2..E4 (== the real
// Stylophone's 1.5/3.5/4.5/6.5/7.5/8.5/10.5/11.5 layout).
const SHARP_AFTER = [0, 2, 3, 5, 6, 7, 9, 10];

const bedY = (ky: number) => BED_Y0 + (BED_Y1 - BED_Y0) * ky; // key-bed local (0..1) -> panel y
const bbox = (poly: [number, number][]) => {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// Build all 20 key cells (shared by the keyboard texture drawer AND the touch hit-meshes).
export function keyCells(): KeyCell[] {
  const naturals = KEYS.filter((m) => keyRow(m) === 'natural'); // 12
  const cells: KeyCell[] = [];

  // naturals: rectangles with chamfered top corners, bottom band of the key bed
  const nTop = 0.66; // natural height (fraction of the key bed)
  const chamX = COLW * 0.22;
  const chamY = 0.12;
  naturals.forEach((midi, k) => {
    const x0 = k * COLW + GAP;
    const x1 = (k + 1) * COLW - GAP;
    const y0 = bedY(0.0);
    const yTop = bedY(nTop);
    const yc = bedY(nTop - chamY);
    const poly: [number, number][] = [
      [x0, y0], [x1, y0], [x1, yc], [x1 - chamX, yTop], [x0 + chamX, yTop], [x0, yc],
    ];
    cells.push({ midi, kind: 'natural', label: String(k + 1), poly, hit: bbox(poly) });
  });

  // sharps: pentagon tabs on the boundaries, upper band, chamfered top corners
  const sBot = 0.42;
  const sw = COLW * 0.34;
  const sChamX = sw * 0.55;
  const sChamY = 0.14;
  for (let a = 0; a < naturals.length - 1; a++) {
    if (!SHARP_AFTER.includes(a)) continue;
    const sharp = naturals[a] + 1;
    const bx = (a + 1) * COLW;
    const x0 = bx - sw;
    const x1 = bx + sw;
    const y0 = bedY(sBot);
    const yTop = bedY(1.0);
    const yc = bedY(1.0 - sChamY);
    const poly: [number, number][] = [
      [x0, y0], [x1, y0], [x1, yc], [x1 - sChamX, yTop], [x0 + sChamX, yTop], [x0, yc],
    ];
    cells.push({ midi: sharp, kind: 'sharp', label: String(a + 1) + '.5', poly, hit: bbox(poly) });
  }
  return cells;
}
