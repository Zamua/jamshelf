import { VOICES, type DrumVoice, type Pattern } from '../domain/sequencer';

// The full observable view-model the UI (3D device) renders. Kept plain + serializable.
export interface ViewModel {
  readonly power: boolean;
  readonly playing: boolean;
  readonly bpm: number;
  // the playhead position 0..15 while playing, or -1 when stopped.
  readonly currentStep: number;
  // the voice the 16 step buttons currently program.
  readonly selected: DrumVoice;
  // the full pattern grid (the UI shows the selected voice's row on the step buttons).
  readonly pattern: Pattern;
  readonly volume: number; // master 0..1
  readonly levels: Record<DrumVoice, number>; // per-voice level 0..1 (the LEVEL knobs)
  readonly inspect: boolean;
}

export type Listener = (vm: ViewModel) => void;

export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const DEFAULT_LEVEL = 0.8;

// Every voice at the default level.
export function defaultLevels(): Record<DrumVoice, number> {
  const l = {} as Record<DrumVoice, number>;
  for (const v of VOICES) l[v] = DEFAULT_LEVEL;
  return l;
}
