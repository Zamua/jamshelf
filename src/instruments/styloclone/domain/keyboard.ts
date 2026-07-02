// Pure domain model for the StyloClone keyboard. No I/O, no framework imports.
// Faithful to the 1968 Dubreq Stylophone Standard: 20 metal keys, A2 -> E4 chromatic,
// laid out piano-style (naturals on the bottom row, accidentals offset on top).

// A MIDI note number (A4 = 69 = 440 Hz).
export type Midi = number;

// The original spans A2 (MIDI 45) to E4 (MIDI 64) inclusive = 20 chromatic keys.
export const LOWEST_MIDI: Midi = 45; // A2
export const HIGHEST_MIDI: Midi = 64; // E4
export const KEY_COUNT = HIGHEST_MIDI - LOWEST_MIDI + 1; // 20

// Every playable MIDI note, low to high (length KEY_COUNT).
export const KEYS: readonly Midi[] = Array.from({ length: KEY_COUNT }, (_, i) => LOWEST_MIDI + i);

// Which physical row a key sits on. Naturals form the long bottom row; the sharps/flats
// (the black keys) sit offset in the shorter top row, exactly like a piano.
export type KeyRow = 'natural' | 'accidental';

// The 12 pitch classes that are accidentals (black keys): C#, D#, F#, G#, A#.
const ACCIDENTAL_PCS = new Set([1, 3, 6, 8, 10]);

// Is this MIDI note an accidental (top row) or a natural (bottom row)?
export function keyRow(midi: Midi): KeyRow {
  return ACCIDENTAL_PCS.has(((midi % 12) + 12) % 12) ? 'accidental' : 'natural';
}

// Note spelling (sharps), C = 0 .. B = 11.
const NOTE_NAMES: readonly string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// A key's display name with octave, e.g. 45 -> "A2", 64 -> "E4". Octave numbering is
// scientific pitch (MIDI 60 = C4 = middle C).
export function noteName(midi: Midi): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[pc] + octave;
}

// Is a MIDI note on the StyloClone keyboard?
export function isPlayable(midi: Midi): boolean {
  return midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI;
}

// A4 = 69 = 440 Hz. Equal temperament.
export function midiToFreq(n: Midi): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}
