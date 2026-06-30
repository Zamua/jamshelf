import type { Degree, KeyState, Midi, PitchClass, Quality, Chord } from './types';
import { SCALES, NOTE_NAMES } from './scales';

// Semitone offset for scale position i (i may exceed the scale length; it wraps
// into octaves). Works for any scale size (7-note modes, 5-note pentatonics, etc.).
function scaleTone(intervals: readonly number[], i: number): number {
  const n = intervals.length;
  const octave = Math.floor(i / n);
  const idx = ((i % n) + n) % n;
  return intervals[idx] + 12 * octave;
}

// Build the offset set (relative to the key root) for a degree + quality.
// Qualities are built from scale tones so everything stays diatonic ("no wrong notes").
export function qualityOffsets(
  degree: Degree,
  scaleIntervals: readonly number[],
  quality: Quality,
): number[] {
  const i = degree - 1;
  const t = (k: number) => scaleTone(scaleIntervals, i + k);
  const root = t(0);
  const third = t(2);
  const fifth = t(4);
  const triad = [root, third, fifth];
  // The diatonic 7th/9th keep "no wrong notes"; FLIP/DOM7/DIM/AUG are deliberate
  // chromatic alterations (as on the real device's DEFAULT joystick).
  switch (quality) {
    case 'TRIAD':
      return triad;
    case 'FLIP': {
      // flip the third major <-> minor relative to the root
      const isMajorThird = (((third - root) % 12) + 12) % 12 === 4;
      return [root, isMajorThird ? root + 3 : root + 4, fifth];
    }
    case 'DOM7':
      return [root, third, fifth, root + 10]; // force a flat (dominant) 7th
    case '7th':
      return [root, third, fifth, t(6)]; // natural/diatonic 7th (maj7 or min7)
    case '9th':
      return [root, third, fifth, t(6), t(8)]; // diatonic 7th + 9th
    case 'sus4':
      return [root, root + 5, fifth]; // replace the 3rd with a perfect 4th
    case '6th':
      return [root, third, fifth, root + 9]; // add a major 6th
    case 'DIM':
      return [root, root + 3, root + 6]; // diminished triad (dark)
    case 'AUG':
      return [root, root + 4, root + 8]; // augmented triad (raised 5th)
    default:
      return triad;
  }
}

// A4 = 69 = 440 Hz.
export function midiToFreq(n: Midi): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// Resolve a degree + quality + key into concrete MIDI notes.
export function degreeToMidiNotes(
  degree: Degree,
  key: KeyState,
  quality: Quality,
): Midi[] {
  const intervals = SCALES[key.scale];
  const effectiveRoot = 60 + key.root + 12 * key.octave; // C4 = 60 anchor
  return qualityOffsets(degree, intervals, quality).map((o) => o + effectiveRoot);
}

// Name a chord from its actual interval set (relative to the lowest note).
function nameQuality(intervalSet: Set<number>): string {
  const h = (x: number) => intervalSet.has(((x % 12) + 12) % 12);
  const hasMaj3 = h(4);
  const hasMin3 = h(3);
  const third = hasMaj3 ? 'maj' : hasMin3 ? 'min' : 'sus';

  if (third === 'sus') {
    if (h(5)) return 'sus4';
    if (h(2)) return 'sus2';
    return '5';
  }

  let base: string;
  if (third === 'min') {
    base = h(6) && !h(7) ? 'dim' : 'm';
  } else {
    base = '';
  }

  // Augmented: a major third with a raised fifth (#5) and no perfect fifth.
  // Surfaces the III+ triads of harmonic/melodic minor (e.g. Eb-G-B).
  const hasAug5 = third === 'maj' && h(8) && !h(7);

  if (h(11)) {
    if (base === 'm') return h(2) ? 'm(maj9)' : 'm(maj7)';
    const maj7 = h(2) ? 'maj9' : 'maj7';
    return hasAug5 ? maj7 + '#5' : maj7;
  }
  if (h(10)) {
    if (base === 'dim') return 'm7b5';
    if (base === 'm') return h(2) ? 'm9' : 'm7';
    return h(2) ? '9' : '7';
  }
  // A diminished triad carrying a diminished seventh (bb7 = 9 semitones) is a
  // full dim7 (e.g. harmonic-minor vii); a bare dim triad has no such tone.
  if (base === 'dim') return h(9) ? 'dim7' : 'dim';
  if (hasAug5) return 'aug';

  if (h(9)) return base === 'm' ? 'm6' : '6';
  if (h(2)) return base === 'm' ? 'm(add9)' : 'add9';
  return base;
}

export function nameChord(notes: Midi[]): string {
  const root = notes[0];
  const rootPC: PitchClass = ((Math.round(root) % 12) + 12) % 12;
  const iset = new Set(
    notes.map((n) => (((Math.round(n - root)) % 12) + 12) % 12),
  );
  return NOTE_NAMES[rootPC] + nameQuality(iset);
}

// Resolve a full Chord value object (notes + name) for a degree.
export function resolveChord(
  degree: Degree,
  key: KeyState,
  quality: Quality,
): Chord {
  const notes = degreeToMidiNotes(degree, key, quality);
  return { degree, quality, notes, name: nameChord(notes) };
}
