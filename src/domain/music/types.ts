// Pure domain types for the chord-synth music model. No I/O, no framework imports.

// Pitch class 0..11 where C = 0, C# = 1, ... B = 11.
export type PitchClass = number;

// A MIDI note number (A4 = 69 = 440 Hz).
export type Midi = number;

// Scale degree 1..7 (Nashville-number style). 1 = tonic.
export type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// The seven-note scales/modes the instrument offers (each maps the 7 pads to 7 degrees).
export type ScaleName =
  | 'MAJOR'
  | 'MINOR'
  | 'HARMONIC'
  | 'MELODIC'
  | 'DORIAN'
  | 'MIXO'
  | 'LYDIAN';

// The joystick chord-quality morph states: the centre (TRIAD) plus the 8 compass
// directions, matching the real device's DEFAULT joystick layout:
//   up = FLIP (maj<->min)   up-right = DOM7        right = 7th (natural maj7/min7)
//   down-right = 9th        down = sus4           down-left = 6th
//   left = DIM              up-left = AUG
export type Quality =
  | 'TRIAD'
  | 'FLIP'
  | 'DOM7'
  | '7th'
  | '9th'
  | 'sus4'
  | '6th'
  | 'DIM'
  | 'AUG';

// Immutable description of the current key/scale/octave selection (a value object).
export interface KeyState {
  readonly root: PitchClass; // 0..11
  readonly scale: ScaleName;
  readonly octave: number; // global octave offset, e.g. -1..+2
}

// A resolved chord: the concrete notes plus the name to show on the screen.
export interface Chord {
  readonly degree: Degree;
  readonly quality: Quality;
  readonly notes: Midi[];
  readonly name: string; // e.g. "C", "Dm", "G7", "Bdim"
}
