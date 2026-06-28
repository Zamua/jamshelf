import { describe, it, expect } from 'vitest';
import {
  SCALES,
  SCALE_LABELS,
  SCALE_ORDER,
  PAD_LAYOUT,
  NOTE_NAMES,
} from '../scales';
import type { ScaleName, Degree } from '../types';

const ALL_SCALES: ScaleName[] = [
  'MAJOR',
  'MINOR',
  'HARMONIC',
  'MELODIC',
  'DORIAN',
  'MIXO',
  'LYDIAN',
];

describe('SCALES interval sets', () => {
  // Each scale is verified against its canonical semitone formula.
  const expected: Record<ScaleName, number[]> = {
    MAJOR: [0, 2, 4, 5, 7, 9, 11], // W W H W W W H
    MINOR: [0, 2, 3, 5, 7, 8, 10], // natural minor / Aeolian
    HARMONIC: [0, 2, 3, 5, 7, 8, 11], // raised 7
    MELODIC: [0, 2, 3, 5, 7, 9, 11], // raised 6 and 7 (ascending)
    DORIAN: [0, 2, 3, 5, 7, 9, 10], // minor with a natural 6
    MIXO: [0, 2, 4, 5, 7, 9, 10], // major with a b7
    LYDIAN: [0, 2, 4, 6, 7, 9, 11], // major with a #4
  };

  for (const scale of ALL_SCALES) {
    it(`${scale} has the correct semitone intervals`, () => {
      expect(SCALES[scale]).toEqual(expected[scale]);
    });
  }

  it('covers every scale the type enumerates (no missing or extra keys)', () => {
    expect(Object.keys(SCALES).sort()).toEqual([...ALL_SCALES].sort());
  });

  for (const scale of ALL_SCALES) {
    it(`${scale} is 7 unique tones, ascending, within one octave, rooted at 0`, () => {
      const tones = SCALES[scale];
      expect(tones).toHaveLength(7);
      expect(tones[0]).toBe(0); // rooted at the tonic
      expect(new Set(tones).size).toBe(7); // all distinct
      for (let i = 1; i < tones.length; i++) {
        expect(tones[i]).toBeGreaterThan(tones[i - 1]); // strictly ascending
      }
      expect(tones[6]).toBeLessThan(12); // stays inside the octave
    });
  }

  it('the three minor-family scales share the b3', () => {
    for (const scale of ['MINOR', 'HARMONIC', 'MELODIC', 'DORIAN'] as ScaleName[]) {
      expect(SCALES[scale]).toContain(3);
      expect(SCALES[scale]).not.toContain(4);
    }
  });
});

describe('scale metadata', () => {
  it('SCALE_LABELS has a 3-char label for every scale', () => {
    for (const scale of ALL_SCALES) {
      expect(SCALE_LABELS[scale]).toBeDefined();
      expect(SCALE_LABELS[scale]).toHaveLength(3);
    }
    expect(Object.keys(SCALE_LABELS).sort()).toEqual([...ALL_SCALES].sort());
  });

  it('SCALE_ORDER lists every scale exactly once', () => {
    expect([...SCALE_ORDER].sort()).toEqual([...ALL_SCALES].sort());
    expect(SCALE_ORDER).toHaveLength(7);
    expect(new Set(SCALE_ORDER).size).toBe(7);
  });

  it('SCALE_ORDER starts on MAJOR', () => {
    expect(SCALE_ORDER[0]).toBe('MAJOR');
  });
});

describe('NOTE_NAMES', () => {
  it('is the 12 chromatic pitch classes (sharps) with C at index 0', () => {
    expect(NOTE_NAMES).toEqual([
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
    ]);
  });

  it('places A at pitch class 9 (the A4 = 440 anchor)', () => {
    expect(NOTE_NAMES[9]).toBe('A');
  });
});

describe('PAD_LAYOUT', () => {
  it('puts the odd degrees on the bottom row', () => {
    expect(PAD_LAYOUT.bottom).toEqual([1, 3, 5, 7]);
  });

  it('interleaves the even degrees on the top row', () => {
    expect(PAD_LAYOUT.top).toEqual([2, 4, 6]);
  });

  it('covers all 7 degrees exactly once across both rows', () => {
    const all = [...PAD_LAYOUT.bottom, ...PAD_LAYOUT.top];
    expect(all).toHaveLength(7);
    expect(new Set(all).size).toBe(7);
    expect([...all].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps top pads sitting between adjacent bottom pads (piano-style)', () => {
    // each top degree N sits between bottom degrees N-1 and N+1
    for (const top of PAD_LAYOUT.top) {
      const below = (top - 1) as Degree;
      const above = (top + 1) as Degree;
      expect(PAD_LAYOUT.bottom).toContain(below);
      expect(PAD_LAYOUT.bottom).toContain(above);
    }
  });
});
