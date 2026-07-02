import type { Midi } from '../domain/keyboard';
import type { VoiceName } from './ports';

// The full observable view-model the UI (3D device + any overlay) renders. Kept plain +
// serializable so any view can consume it. The StyloClone is simple, so this is small.
export interface ViewModel {
  readonly power: boolean;
  // the single key currently sounding (MIDI), or null when the stylus is off the keyboard.
  readonly litKey: Midi | null;
  readonly vibrato: boolean;
  readonly tune: number; // cents (tune pot), clamped
  readonly volume: number; // 0..1
  readonly voice: VoiceName;
  readonly inspect: boolean;
  // the sounding note's display name (e.g. "C3"), or '' when nothing sounds.
  readonly noteLabel: string;
}

export type Listener = (vm: ViewModel) => void;

// Tune pot travel: +/- 100 cents (a semitone) each way, like the original's modest pitch trim.
export const TUNE_RANGE_CENTS = 100;
