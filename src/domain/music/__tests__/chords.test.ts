import { describe, it, expect } from 'vitest';
import { degreeToMidiNotes, nameChord, resolveChord } from '../chords';
import type { KeyState } from '../types';

const cMajor: KeyState = { root: 0, scale: 'MAJOR', octave: 0 };

describe('diatonic triads in C major', () => {
  it('degree 1 (I) is C major', () => {
    const notes = degreeToMidiNotes(1, cMajor, 'TRIAD');
    expect(notes).toEqual([60, 64, 67]); // C E G
    expect(nameChord(notes)).toBe('C');
  });

  it('degree 5 (V) is G major', () => {
    expect(nameChord(degreeToMidiNotes(5, cMajor, 'TRIAD'))).toBe('G');
  });

  it('degree 7 (vii) is B diminished', () => {
    const notes = degreeToMidiNotes(7, cMajor, 'TRIAD');
    expect(notes).toEqual([71, 74, 77]); // B D F
    expect(nameChord(notes)).toBe('Bdim');
  });
});

describe('quality morphs stay diatonic', () => {
  it('degree 5 with a 7th is a dominant 7 (G7)', () => {
    expect(nameChord(degreeToMidiNotes(5, cMajor, '7th'))).toBe('G7');
  });

  it('degree 1 with a 7th is a major 7 (Cmaj7)', () => {
    expect(nameChord(degreeToMidiNotes(1, cMajor, '7th'))).toBe('Cmaj7');
  });
});

describe('resolveChord', () => {
  it('returns notes plus a name', () => {
    const chord = resolveChord(2, cMajor, 'TRIAD');
    expect(chord.name).toBe('Dm');
    expect(chord.notes.length).toBe(3);
  });
});
