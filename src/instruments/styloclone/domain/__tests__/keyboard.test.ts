import { describe, it, expect } from 'vitest';
import {
  KEYS,
  KEY_COUNT,
  LOWEST_MIDI,
  HIGHEST_MIDI,
  keyRow,
  noteName,
  isPlayable,
  midiToFreq,
} from '../keyboard';

describe('StyloClone keyboard (faithful to the 1968 original)', () => {
  it('has exactly 20 keys', () => {
    expect(KEY_COUNT).toBe(20);
    expect(KEYS).toHaveLength(20);
  });

  it('spans A2 -> E4 chromatically', () => {
    expect(LOWEST_MIDI).toBe(45);
    expect(HIGHEST_MIDI).toBe(64);
    expect(noteName(LOWEST_MIDI)).toBe('A2');
    expect(noteName(HIGHEST_MIDI)).toBe('E4');
    // every step is one semitone, low to high
    for (let i = 1; i < KEYS.length; i++) {
      expect(KEYS[i] - KEYS[i - 1]).toBe(1);
    }
  });

  it('names middle C correctly (MIDI 60 = C4)', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(46)).toBe('A#2');
    expect(noteName(52)).toBe('E3');
  });

  it('splits naturals (bottom) from accidentals (top) like a piano', () => {
    const naturals = KEYS.filter((m) => keyRow(m) === 'natural');
    const accidentals = KEYS.filter((m) => keyRow(m) === 'accidental');
    // 12 naturals + 8 accidentals over A2..E4
    expect(naturals).toHaveLength(12);
    expect(accidentals).toHaveLength(8);
    // A2 is natural, A#2 is accidental
    expect(keyRow(45)).toBe('natural');
    expect(keyRow(46)).toBe('accidental');
    // no accidental between B/C or E/F
    expect(keyRow(47)).toBe('natural'); // B2
    expect(keyRow(48)).toBe('natural'); // C3
    expect(keyRow(52)).toBe('natural'); // E3
    expect(keyRow(53)).toBe('natural'); // F3
  });

  it('gates playability to the 20-key range', () => {
    expect(isPlayable(44)).toBe(false); // G#2, just below
    expect(isPlayable(45)).toBe(true);
    expect(isPlayable(64)).toBe(true);
    expect(isPlayable(65)).toBe(false); // F4, just above
  });

  it('converts MIDI to frequency (A4 = 440)', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    expect(midiToFreq(45)).toBeCloseTo(110, 3); // A2
    expect(midiToFreq(57)).toBeCloseTo(220, 3); // A3
  });
});
