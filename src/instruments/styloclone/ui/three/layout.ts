import { KEYS, keyRow, type Midi } from '../../domain/keyboard';

// All geometry constants for the modeled StyloClone, in world units. The device is a landscape
// slab facing +Z (the play view). +Y is the physical top edge. Faithful to the 1968 Stylophone
// Standard: a cream box with a silver metal keyboard plate (20 keys, piano interleave), a round
// speaker, the wordmark, the vibrato + power switches, the tune + volume pots, and a tethered
// stylus. The real device is chunky and landscape (~6.5 x 3.5 in).
export const BODY = { w: 4.9, h: 3.0, d: 0.55 } as const;

export const FRONT_Z = BODY.d / 2;
export const BODY_RADIUS = 0.12;

// The App camera (composition root) is fixed at this distance + fov (shared across instruments).
export const CAM_DIST = 7;
export const CAM_FOV = 42;

// The silver metal keyboard PLATE: a raised rounded panel across the lower face, holding all 20
// keys. The controls + speaker + wordmark live on the cream land above it.
export const PLATE = {
  x: 0,
  y: -0.78,
  w: 4.5,
  h: 1.32,
  z: FRONT_Z, // sits proud of the cream face
  raise: 0.03,
  radius: 0.09,
} as const;

// Key contact geometry. Naturals form the long bottom row; accidentals (black keys) sit in the
// gaps above, piano-style. Keys sit flush on the plate; the pressed one gets a subtle glow.
export interface KeySpec {
  midi: Midi;
  row: 'natural' | 'accidental';
  x: number;
  y: number;
  w: number;
  h: number;
}

const PLATE_LEFT = PLATE.x - PLATE.w / 2;
const PLATE_PAD = 0.09; // inset from the plate edge
const KEY_GAP = 0.035; // thin dark gap between contacts

// Build the 20 key specs. The 12 naturals are evenly spaced across the plate's bottom row; each
// accidental sits at the boundary between its two flanking naturals, in a shorter top row.
export function keySpecs(): KeySpec[] {
  const naturals = KEYS.filter((m) => keyRow(m) === 'natural'); // 12, low -> high
  const usableW = PLATE.w - PLATE_PAD * 2;
  const cellW = usableW / naturals.length;
  const natW = cellW - KEY_GAP;
  const left = PLATE_LEFT + PLATE_PAD;
  const natCenterX = (i: number) => left + (i + 0.5) * cellW;

  const natY = PLATE.y - PLATE.h / 2 + PLATE_PAD + (PLATE.h - PLATE_PAD * 2) * 0.34; // lower row
  const natH = (PLATE.h - PLATE_PAD * 2) * 0.66;
  const accY = PLATE.y + PLATE.h / 2 - PLATE_PAD - (PLATE.h - PLATE_PAD * 2) * 0.22; // upper row
  const accH = (PLATE.h - PLATE_PAD * 2) * 0.42;
  const accW = natW * 0.66;

  const specs: KeySpec[] = [];
  // naturals
  naturals.forEach((midi, i) => {
    specs.push({ midi, row: 'natural', x: natCenterX(i), y: natY, w: natW, h: natH });
  });
  // accidentals: each sits between natural i and i+1 (the ones that have a black key after them)
  for (let i = 0; i < naturals.length - 1; i++) {
    const sharp = naturals[i] + 1;
    if (keyRow(sharp) !== 'accidental') continue; // no black key between B/C or E/F
    const x = (natCenterX(i) + natCenterX(i + 1)) / 2;
    specs.push({ midi: sharp, row: 'accidental', x, y: accY, w: accW, h: accH });
  }
  return specs;
}

// Cream-land furniture (above the plate).
export const SPEAKER = { x: -1.9, y: 0.92, r: 0.42 } as const;
export const BRAND = { x: 0.6, y: 1.04, text: 'StyloClone' } as const;
export const TAGLINE = { x: 0.6, y: 0.68, text: 'the pocket synthesizer' } as const;

// Controls row (a clean band above the plate): the vibrato switch, tune pot, volume pot, power
// switch. Kept clear of the accidental keys below and the wordmark above.
export const VIBRATO = { x: -0.7, y: 0.34, w: 0.32, h: 0.44 } as const; // toggle switch
export const TUNE = { x: 0.2, y: 0.34, r: 0.22 } as const; // rotary pot
export const VOLUME = { x: 0.95, y: 0.34, r: 0.22 } as const; // rotary pot
export const POWER = { x: 1.82, y: 0.34, w: 0.32, h: 0.44 } as const; // toggle switch

// The tethered stylus: a slim pen resting diagonally over the RIGHT half of the keyboard (clear of
// the knobs), on a cord running up to the top edge.
export const STYLUS = { tipX: 1.95, tipY: -1.06, len: 2.4, angle: -0.32, r: 0.06 } as const;
