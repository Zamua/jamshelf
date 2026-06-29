import type { Degree, Midi } from './types';

// Performance domain: HOW a resolved chord's notes are delivered over time. Pure
// (no I/O, no timing, no randomness in the deterministic helpers). The application
// drives these from a Clock port; the domain just answers "given these notes +
// this setting, what plays".

// The play modes (menu order). PLAY = full chord; STRUM = rolled; ARP = stepped;
// DRONE = latched sustain; REPEAT = rhythmic pulse; LEAD = monophonic root;
// DRUM = the 7 pads play a drum kit instead of chords.
export type PlayMode = 'PLAY' | 'STRUM' | 'ARP' | 'DRONE' | 'REPEAT' | 'LEAD' | 'DRUM';
export const PLAY_MODES: readonly PlayMode[] = [
  'PLAY',
  'STRUM',
  'ARP',
  'DRONE',
  'REPEAT',
  'LEAD',
  'DRUM',
];

// The drum kit voices. In DRUM mode the 7 pads map to these (kick, alt kick, snare,
// closed hat, tom, ride, open hat) - the same layout as the real device.
export type DrumName = 'KICK' | 'KICK2' | 'SNARE' | 'HAT' | 'TOM' | 'RIDE' | 'OPENHAT';
const DRUM_PADS: readonly DrumName[] = ['KICK', 'KICK2', 'SNARE', 'HAT', 'TOM', 'RIDE', 'OPENHAT'];
export function drumForDegree(degree: Degree): DrumName {
  return DRUM_PADS[(degree - 1) % DRUM_PADS.length];
}

// The drum kits (the synthesis is tuned differently per kit).
export type DrumKit = 'TIGHT' | 'BOX808' | 'BOX909';
export const DRUM_KITS: readonly DrumKit[] = ['TIGHT', 'BOX808', 'BOX909'];

// Global effects: a tempo-synced delay and/or a chorus (reverb is always on).
export type FxMode = 'OFF' | 'DELAY' | 'CHORUS' | 'BOTH';
export const FX_MODES: readonly FxMode[] = ['OFF', 'DELAY', 'CHORUS', 'BOTH'];
export function fxHasDelay(fx: FxMode): boolean {
  return fx === 'DELAY' || fx === 'BOTH';
}
export function fxHasChorus(fx: FxMode): boolean {
  return fx === 'CHORUS' || fx === 'BOTH';
}

// Arpeggiator step patterns.
export type ArpPattern = 'UP' | 'DOWN' | 'UPDOWN' | 'DOWNUP' | 'RANDOM' | 'FINGER';
export const ARP_PATTERNS: readonly ArpPattern[] = [
  'UP',
  'DOWN',
  'UPDOWN',
  'DOWNUP',
  'RANDOM',
  'FINGER',
];

// Tempo subdivisions for ARP + REPEAT (1/8T = eighth-note triplet).
export type Rate = '1/4' | '1/8' | '1/16' | '1/8T';
export const RATES: readonly Rate[] = ['1/4', '1/8', '1/16', '1/8T'];

// Strum speeds (per-note roll spread).
export type StrumSpeed = 'SLOW' | 'MED' | 'FAST';
export const STRUM_SPEEDS: readonly StrumSpeed[] = ['SLOW', 'MED', 'FAST'];

// Optional bass voice under the chord. ROOT adds the chord root two octaves down.
export type BassMode = 'OFF' | 'ROOT';
export const BASS_MODES: readonly BassMode[] = ['OFF', 'ROOT'];

// Inversions cycle Root / 1st / 2nd (like the real device).
export const INVERSIONS = 3;

// Invert a chord: lift the lowest `inversion` notes up an octave (and move them to
// the top). 0 = root position, 1 = 1st inversion, 2 = 2nd. Reshuffles which note is
// lowest for smoother voice leading; the chord's identity (and name) is unchanged.
export function invert(notes: readonly Midi[], inversion: number): Midi[] {
  const n = notes.length;
  if (n === 0) return [];
  const k = ((inversion % n) + n) % n;
  return [...notes.slice(k), ...notes.slice(0, k).map((m) => m + 12)];
}

// Voice a chord for playback: apply the inversion, then (for bass ROOT) prepend the
// chord ROOT two octaves down. Bass is always the original root, independent of the
// inversion. `notes[0]` is the chord root (chords are built ascending from it).
export function voiceChord(
  notes: readonly Midi[],
  inversion: number,
  bass: BassMode,
): Midi[] {
  if (notes.length === 0) return [];
  const inverted = invert(notes, inversion);
  return bass === 'ROOT' ? [notes[0] - 24, ...inverted] : inverted;
}

// Beats per tick for a rate. 1/4 = one beat, 1/8 = half, 1/16 = quarter,
// 1/8T = a third of a beat (three per beat).
export function rateBeats(rate: Rate): number {
  switch (rate) {
    case '1/4':
      return 1;
    case '1/8':
      return 0.5;
    case '1/16':
      return 0.25;
    case '1/8T':
      return 1 / 3;
  }
}

// Per-note strum spread in milliseconds.
export function strumMs(speed: StrumSpeed): number {
  switch (speed) {
    case 'SLOW':
      return 120;
    case 'MED':
      return 80;
    case 'FAST':
      return 40;
  }
}

// The ordered note cycle an arpeggiator steps through for a pattern. The caller
// advances an index and reads `order[step % order.length]`. RANDOM returns the
// notes ascending (the caller injects the randomness by picking a random index),
// keeping non-determinism out of the pure domain.
export function arpOrder(notes: readonly Midi[], pattern: ArpPattern): Midi[] {
  const sorted = [...notes].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted;

  switch (pattern) {
    case 'UP':
      return sorted;
    case 'DOWN':
      return [...sorted].reverse();
    case 'UPDOWN':
      // up, then back down WITHOUT repeating the endpoints: [a,b,c] -> [a,b,c,b].
      return [...sorted, ...sorted.slice(1, -1).reverse()];
    case 'DOWNUP':
      // down, then back up without repeating the endpoints: [a,b,c] -> [c,b,a,b].
      return [...[...sorted].reverse(), ...sorted.slice(1, -1)];
    case 'RANDOM':
      return sorted;
    case 'FINGER': {
      // Travis-style fingerpick: the top note alternates with each lower note,
      // bass first: [a,b,c] -> [a,c,b,c]; [a,b,c,d] -> [a,d,b,d,c,d].
      const top = sorted[sorted.length - 1];
      const out: Midi[] = [];
      for (let i = 0; i < sorted.length - 1; i++) out.push(sorted[i], top);
      return out;
    }
  }
}

// The single note a LEAD line plays for a chord: the root (the lowest note).
export function leadNote(notes: readonly Midi[]): Midi {
  return notes.reduce((lo, n) => (n < lo ? n : lo), notes[0]);
}
