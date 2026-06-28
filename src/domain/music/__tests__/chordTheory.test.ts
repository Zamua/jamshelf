import { describe, it, expect } from 'vitest';
import {
  degreeToMidiNotes,
  qualityOffsets,
  nameChord,
  resolveChord,
  midiToFreq,
} from '../chords';
import { SCALES } from '../scales';
import type { KeyState, ScaleName, Degree, Quality } from '../types';

const ALL_SCALES: ScaleName[] = [
  'MAJOR',
  'MINOR',
  'HARMONIC',
  'MELODIC',
  'DORIAN',
  'MIXO',
  'LYDIAN',
];
const ALL_DEGREES: Degree[] = [1, 2, 3, 4, 5, 6, 7];
const ALL_QUALITIES: Quality[] = [
  'TRIAD',
  '7th',
  '9th',
  'sus4',
  'sus2',
  'OPEN',
  'add9',
  '6th',
  'JAZZ',
];

const inC = (scale: ScaleName): KeyState => ({ root: 0, scale, octave: 0 });

describe('diatonic triads, all 7 scales (rooted in C, sharp spelling)', () => {
  // The 7 stacked-thirds triads per scale, hand-derived from music theory.
  const expectedTriadNames: Record<ScaleName, string[]> = {
    MAJOR: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'],
    MINOR: ['Cm', 'Ddim', 'D#', 'Fm', 'Gm', 'G#', 'A#'],
    HARMONIC: ['Cm', 'Ddim', 'D#aug', 'Fm', 'G', 'G#', 'Bdim'],
    MELODIC: ['Cm', 'Dm', 'D#aug', 'F', 'G', 'Adim', 'Bdim'],
    DORIAN: ['Cm', 'Dm', 'D#', 'F', 'Gm', 'Adim', 'A#'],
    MIXO: ['C', 'Dm', 'Edim', 'F', 'Gm', 'Am', 'A#'],
    LYDIAN: ['C', 'D', 'Em', 'F#dim', 'G', 'Am', 'Bm'],
  };

  for (const scale of ALL_SCALES) {
    it(`${scale} yields ${expectedTriadNames[scale].join(' ')}`, () => {
      const names = ALL_DEGREES.map(
        (d) => resolveChord(d, inC(scale), 'TRIAD').name,
      );
      expect(names).toEqual(expectedTriadNames[scale]);
    });
  }
});

describe('spot-checked diatonic triads (brief callouts)', () => {
  it('C major I = C major triad on the expected MIDI notes', () => {
    expect(degreeToMidiNotes(1, inC('MAJOR'), 'TRIAD')).toEqual([60, 64, 67]);
  });

  it('Dorian degree 1 in C is Cm, degree 4 is F major', () => {
    expect(resolveChord(1, inC('DORIAN'), 'TRIAD').name).toBe('Cm');
    expect(resolveChord(4, inC('DORIAN'), 'TRIAD').name).toBe('F');
  });

  it('harmonic minor degree 5 is a major (dominant-function) triad', () => {
    const notes = degreeToMidiNotes(5, inC('HARMONIC'), 'TRIAD');
    expect(notes).toEqual([67, 71, 74]); // G B D
    expect(nameChord(notes)).toBe('G');
  });

  it('harmonic minor degree 5 with a 7th is a true dominant 7 (G7)', () => {
    expect(resolveChord(5, inC('HARMONIC'), '7th').name).toBe('G7');
  });

  it('harmonic and melodic minor degree 3 are augmented triads', () => {
    expect(resolveChord(3, inC('HARMONIC'), 'TRIAD').name).toBe('D#aug');
    expect(resolveChord(3, inC('MELODIC'), 'TRIAD').name).toBe('D#aug');
    // Eb-G-B = 0,4,8 (root, major 3rd, augmented 5th)
    expect(degreeToMidiNotes(3, inC('HARMONIC'), 'TRIAD')).toEqual([63, 67, 71]);
  });
});

describe('every quality produces a sane, fully diatonic note set', () => {
  // "No wrong notes": every emitted pitch class must belong to the active scale.
  for (const scale of ALL_SCALES) {
    for (const degree of ALL_DEGREES) {
      for (const quality of ALL_QUALITIES) {
        it(`${scale} deg ${degree} ${quality} stays in-scale`, () => {
          const key = inC(scale);
          const effectiveRoot = 60 + key.root + 12 * key.octave;
          const scalePCs = new Set(SCALES[scale].map((s) => s % 12));
          const notes = degreeToMidiNotes(degree, key, quality);
          expect(notes.length).toBeGreaterThanOrEqual(3);
          for (const n of notes) {
            const pc = (((n - effectiveRoot) % 12) + 12) % 12;
            expect(scalePCs.has(pc)).toBe(true);
          }
        });
      }
    }
  }

  it('the lowest note is always the chord root (degree tone)', () => {
    for (const scale of ALL_SCALES) {
      for (const degree of ALL_DEGREES) {
        for (const quality of ALL_QUALITIES) {
          const notes = degreeToMidiNotes(degree, inC(scale), quality);
          expect(Math.min(...notes)).toBe(notes[0]);
        }
      }
    }
  });
});

describe('quality note-set shapes', () => {
  const key = inC('MAJOR');

  it('TRIAD/sus2/sus4/OPEN are 3-note voicings', () => {
    for (const q of ['TRIAD', 'sus2', 'sus4', 'OPEN'] as Quality[]) {
      expect(qualityOffsets(1, SCALES.MAJOR, q)).toHaveLength(3);
    }
  });

  it('7th/add9/6th are 4-note voicings', () => {
    for (const q of ['7th', 'add9', '6th'] as Quality[]) {
      expect(qualityOffsets(1, SCALES.MAJOR, q)).toHaveLength(4);
    }
  });

  it('9th and JAZZ are 5-note voicings', () => {
    expect(qualityOffsets(1, SCALES.MAJOR, '9th')).toHaveLength(5);
    expect(qualityOffsets(1, SCALES.MAJOR, 'JAZZ')).toHaveLength(5);
  });

  it('OPEN keeps the same pitch classes as the triad but lifts the 3rd an octave', () => {
    const triad = degreeToMidiNotes(1, key, 'TRIAD'); // 60 64 67
    const open = degreeToMidiNotes(1, key, 'OPEN'); // 60 76 67
    expect(open).toEqual([60, 76, 67]);
    const pcs = (xs: number[]) => new Set(xs.map((x) => x % 12));
    expect(pcs(open)).toEqual(pcs(triad));
  });

  it('JAZZ differs from the 9th: it drops the 5th and adds the 11th', () => {
    for (const scale of ALL_SCALES) {
      for (const degree of ALL_DEGREES) {
        const ninth = degreeToMidiNotes(degree, inC(scale), '9th');
        const jazz = degreeToMidiNotes(degree, inC(scale), 'JAZZ');
        expect(jazz).not.toEqual(ninth);
      }
    }
    // concrete: C major I 9th = C E G B D ; JAZZ = C E B D F (no G, adds F)
    expect(degreeToMidiNotes(1, key, '9th')).toEqual([60, 64, 67, 71, 74]);
    expect(degreeToMidiNotes(1, key, 'JAZZ')).toEqual([60, 64, 71, 74, 77]);
  });

  it('sus2 and sus4 replace the 3rd (degree 1 in C major)', () => {
    expect(degreeToMidiNotes(1, key, 'sus2')).toEqual([60, 62, 67]); // C D G
    expect(degreeToMidiNotes(1, key, 'sus4')).toEqual([60, 65, 67]); // C F G
  });
});

describe('nameChord edge cases', () => {
  const key = inC('MAJOR');
  const name = (d: Degree, q: Quality, k: KeyState = key) =>
    resolveChord(d, k, q).name;

  it('major vs minor triads', () => {
    expect(name(1, 'TRIAD')).toBe('C'); // I major has no suffix
    expect(name(2, 'TRIAD')).toBe('Dm'); // ii minor
    expect(name(6, 'TRIAD')).toBe('Am');
  });

  it('diminished triad (vii in major)', () => {
    expect(name(7, 'TRIAD')).toBe('Bdim');
  });

  it('half-diminished / m7b5 (vii 7th in major)', () => {
    expect(name(7, '7th')).toBe('Bm7b5');
  });

  it('full diminished 7 (vii 7th in harmonic minor, bb7 present)', () => {
    // B-D-F-Ab is a true dim7, distinct from the bare Bdim triad.
    expect(name(7, '7th', inC('HARMONIC'))).toBe('Bdim7');
    expect(name(7, 'TRIAD', inC('HARMONIC'))).toBe('Bdim');
  });

  it('dominant 7 vs major 7 (V7 vs Imaj7)', () => {
    expect(name(5, '7th')).toBe('G7'); // dominant: b7
    expect(name(1, '7th')).toBe('Cmaj7'); // tonic: maj7
  });

  it('augmented triad and its maj7#5 extension (harmonic minor III)', () => {
    expect(name(3, 'TRIAD', inC('HARMONIC'))).toBe('D#aug');
    // III with a 7th picks up the major 7, keeping the #5 -> maj7#5
    expect(name(3, '7th', inC('HARMONIC'))).toBe('D#maj7#5');
  });

  it('minor-major 7 (harmonic minor tonic 7th)', () => {
    expect(name(1, '7th', inC('HARMONIC'))).toBe('Cm(maj7)');
  });

  it('minor 7 and dominant 9 / minor 9', () => {
    expect(name(2, '7th')).toBe('Dm7'); // ii7 minor 7
    expect(name(5, '9th')).toBe('G9'); // V9 dominant 9
    expect(name(2, '9th')).toBe('Dm9'); // ii9 minor 9
  });

  it('sus2 and sus4', () => {
    expect(name(1, 'sus2')).toBe('Csus2');
    expect(name(1, 'sus4')).toBe('Csus4');
  });

  it('6 and add9', () => {
    expect(name(1, '6th')).toBe('C6');
    expect(name(1, 'add9')).toBe('Cadd9');
  });

  it('roots are spelled with sharps from the chromatic table', () => {
    // F# major triad: lowest note pitch class 6
    expect(nameChord([66, 70, 73])).toBe('F#');
    expect(nameChord([61, 65, 68])).toBe('C#');
  });
});

describe('key transposition (root + octave offsets)', () => {
  it('shifts the whole chord by the root pitch class', () => {
    const cI = degreeToMidiNotes(1, { root: 0, scale: 'MAJOR', octave: 0 }, 'TRIAD');
    const dI = degreeToMidiNotes(1, { root: 2, scale: 'MAJOR', octave: 0 }, 'TRIAD');
    expect(dI).toEqual(cI.map((n) => n + 2));
    expect(resolveChord(1, { root: 2, scale: 'MAJOR', octave: 0 }, 'TRIAD').name).toBe('D');
  });

  it('shifts the whole chord by 12 per octave', () => {
    const base = degreeToMidiNotes(1, { root: 0, scale: 'MAJOR', octave: 0 }, 'TRIAD');
    const up = degreeToMidiNotes(1, { root: 0, scale: 'MAJOR', octave: 1 }, 'TRIAD');
    const down = degreeToMidiNotes(1, { root: 0, scale: 'MAJOR', octave: -1 }, 'TRIAD');
    expect(up).toEqual(base.map((n) => n + 12));
    expect(down).toEqual(base.map((n) => n - 12));
  });

  it('octave offset does not change the chord name', () => {
    for (const oct of [-2, -1, 0, 1, 2]) {
      expect(resolveChord(5, { root: 0, scale: 'MAJOR', octave: oct }, 'TRIAD').name).toBe('G');
    }
  });
});

describe('resolveChord assembles the full value object', () => {
  it('carries degree, quality, notes and name through unchanged', () => {
    const chord = resolveChord(2, inC('MAJOR'), 'TRIAD');
    expect(chord.degree).toBe(2);
    expect(chord.quality).toBe('TRIAD');
    expect(chord.notes).toEqual([62, 65, 69]);
    expect(chord.name).toBe('Dm');
  });
});

describe('midiToFreq', () => {
  it('anchors A4 (MIDI 69) at 440 Hz', () => {
    expect(midiToFreq(69)).toBe(440);
  });

  it('doubles frequency per octave up, halves per octave down', () => {
    expect(midiToFreq(81)).toBeCloseTo(880, 6); // A5
    expect(midiToFreq(57)).toBeCloseTo(220, 6); // A3
    expect(midiToFreq(93)).toBeCloseTo(1760, 6); // A6
  });

  it('matches the standard equal-temperament references', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3); // middle C
    expect(midiToFreq(64)).toBeCloseTo(329.6276, 3); // E4
    expect(midiToFreq(72)).toBeCloseTo(523.2511, 3); // C5
  });

  it('a semitone is the twelfth root of two', () => {
    expect(midiToFreq(70) / midiToFreq(69)).toBeCloseTo(Math.pow(2, 1 / 12), 9);
  });
});
