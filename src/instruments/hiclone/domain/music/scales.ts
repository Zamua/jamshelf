import type { ScaleName, Degree } from './types';

// Semitone interval sets (from the root) for each seven-note scale.
// The 7 pads always map to the 7 diatonic degrees of the active scale, so the
// chord qualities emerge from stacking scale thirds (never hardcoded).
export const SCALES: Record<ScaleName, readonly number[]> = {
  MAJOR: [0, 2, 4, 5, 7, 9, 11],
  MINOR: [0, 2, 3, 5, 7, 8, 10], // natural minor (Aeolian)
  HARMONIC: [0, 2, 3, 5, 7, 8, 11], // harmonic minor
  MELODIC: [0, 2, 3, 5, 7, 9, 11], // melodic minor (ascending)
  DORIAN: [0, 2, 3, 5, 7, 9, 10],
  MIXO: [0, 2, 4, 5, 7, 9, 10], // mixolydian
  LYDIAN: [0, 2, 4, 6, 7, 9, 11],
  MAJ_PENT: [0, 2, 4, 7, 9], // major pentatonic (5 notes)
  MIN_PENT: [0, 3, 5, 7, 10], // minor pentatonic (5 notes)
  BLUES: [0, 3, 5, 6, 7, 10], // blues (6 notes, with the b5)
};

// Short labels for the OLED screen.
export const SCALE_LABELS: Record<ScaleName, string> = {
  MAJOR: 'MAJ',
  MINOR: 'MIN',
  HARMONIC: 'HMN',
  MELODIC: 'MEL',
  DORIAN: 'DOR',
  MIXO: 'MIX',
  LYDIAN: 'LYD',
  MAJ_PENT: 'PNT',
  MIN_PENT: 'mPN',
  BLUES: 'BLU',
};

export const SCALE_ORDER: readonly ScaleName[] = [
  'MAJOR',
  'MINOR',
  'HARMONIC',
  'MELODIC',
  'DORIAN',
  'MIXO',
  'LYDIAN',
  'MAJ_PENT',
  'MIN_PENT',
  'BLUES',
];

// Physical pad layout. The device has 3 pads on the top sub-row and 4 on the
// bottom. The bottom row carries the odd degrees and the top row interleaves
// the even degrees "in between" them, piano-style:
//   bottom (left -> right): degrees 1, 3, 5, 7
//   top    (left -> right): degrees 2, 4, 6   (each sits between two bottom pads)
export const PAD_LAYOUT: { readonly bottom: Degree[]; readonly top: Degree[] } = {
  bottom: [1, 3, 5, 7],
  top: [2, 4, 6],
};

// Note spelling (default to sharps).
export const NOTE_NAMES: readonly string[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];
