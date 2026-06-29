import { describe, it, expect } from 'vitest';
import {
  PLAY_MODES,
  ARP_PATTERNS,
  RATES,
  STRUM_SPEEDS,
  BASS_MODES,
  rateBeats,
  strumMs,
  arpOrder,
  leadNote,
  invert,
  voiceChord,
} from '../performance';

describe('performance value sets', () => {
  it('lists the play modes in menu order', () => {
    expect(PLAY_MODES).toEqual(['PLAY', 'STRUM', 'ARP', 'DRONE', 'REPEAT', 'LEAD']);
  });
  it('lists arp patterns, rates and strum speeds', () => {
    expect(ARP_PATTERNS).toEqual(['UP', 'DOWN', 'UPDOWN', 'DOWNUP', 'RANDOM', 'FINGER']);
    expect(RATES).toEqual(['1/4', '1/8', '1/16', '1/8T']);
    expect(STRUM_SPEEDS).toEqual(['SLOW', 'MED', 'FAST']);
  });
});

describe('rateBeats', () => {
  it('maps subdivisions to beats per tick', () => {
    expect(rateBeats('1/4')).toBe(1);
    expect(rateBeats('1/8')).toBe(0.5);
    expect(rateBeats('1/16')).toBe(0.25);
    expect(rateBeats('1/8T')).toBeCloseTo(1 / 3, 10);
  });
});

describe('strumMs', () => {
  it('maps strum speeds to per-note ms', () => {
    expect(strumMs('SLOW')).toBe(120);
    expect(strumMs('MED')).toBe(80);
    expect(strumMs('FAST')).toBe(40);
  });
});

describe('arpOrder', () => {
  const triad = [60, 64, 67]; // C E G
  const seventh = [60, 64, 67, 70]; // C E G Bb

  it('sorts ascending regardless of input order', () => {
    expect(arpOrder([67, 60, 64], 'UP')).toEqual([60, 64, 67]);
  });
  it('UP is ascending, DOWN is descending', () => {
    expect(arpOrder(triad, 'UP')).toEqual([60, 64, 67]);
    expect(arpOrder(triad, 'DOWN')).toEqual([67, 64, 60]);
  });
  it('UPDOWN bounces without repeating the endpoints', () => {
    expect(arpOrder(triad, 'UPDOWN')).toEqual([60, 64, 67, 64]);
    expect(arpOrder(seventh, 'UPDOWN')).toEqual([60, 64, 67, 70, 67, 64]);
  });
  it('DOWNUP mirrors UPDOWN', () => {
    expect(arpOrder(triad, 'DOWNUP')).toEqual([67, 64, 60, 64]);
    expect(arpOrder(seventh, 'DOWNUP')).toEqual([70, 67, 64, 60, 64, 67]);
  });
  it('RANDOM returns the ascending notes (caller injects randomness)', () => {
    expect(arpOrder(triad, 'RANDOM')).toEqual([60, 64, 67]);
  });
  it('FINGER alternates the top note with each lower note, bass first', () => {
    expect(arpOrder(triad, 'FINGER')).toEqual([60, 67, 64, 67]);
    expect(arpOrder(seventh, 'FINGER')).toEqual([60, 70, 64, 70, 67, 70]);
  });
  it('handles trivial note sets', () => {
    expect(arpOrder([], 'UP')).toEqual([]);
    expect(arpOrder([60], 'UPDOWN')).toEqual([60]);
  });
});

describe('leadNote', () => {
  it('returns the lowest note (the root)', () => {
    expect(leadNote([60, 64, 67])).toBe(60);
    expect(leadNote([67, 60, 64])).toBe(60);
  });
});

describe('invert', () => {
  it('0 = root position (unchanged)', () => {
    expect(invert([60, 64, 67], 0)).toEqual([60, 64, 67]);
  });
  it('1st inversion lifts the lowest note an octave to the top', () => {
    expect(invert([60, 64, 67], 1)).toEqual([64, 67, 72]);
  });
  it('2nd inversion lifts the lowest two', () => {
    expect(invert([60, 64, 67], 2)).toEqual([67, 72, 76]);
  });
  it('handles an empty chord', () => {
    expect(invert([], 1)).toEqual([]);
  });
});

describe('voiceChord (inversion + bass)', () => {
  it('lists the bass modes', () => {
    expect(BASS_MODES).toEqual(['OFF', 'ROOT']);
  });
  it('root position, no bass = the chord unchanged', () => {
    expect(voiceChord([60, 64, 67], 0, 'OFF')).toEqual([60, 64, 67]);
  });
  it('bass ROOT prepends the original root two octaves down', () => {
    expect(voiceChord([60, 64, 67], 0, 'ROOT')).toEqual([36, 60, 64, 67]);
  });
  it('bass is always the ORIGINAL root, even when inverted', () => {
    // 1st inversion is [64,67,72]; the bass must still be 60-24 = 36, not 64-24
    expect(voiceChord([60, 64, 67], 1, 'ROOT')).toEqual([36, 64, 67, 72]);
  });
});
