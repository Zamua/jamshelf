// Ports = the narrow interfaces the application depends on. Concrete adapters
// (Web Audio, a test stub, ...) live in infrastructure and implement these.
// The application/domain never import a vendor SDK or framework directly.

export type PatchName = 'POLY' | 'WARM' | 'PLUCK' | 'ORGAN' | 'BELL' | 'SQUARE';

export const PATCH_ORDER: readonly PatchName[] = [
  'POLY',
  'WARM',
  'PLUCK',
  'ORGAN',
  'BELL',
  'SQUARE',
];

// The audio output port. Voice groups are addressed by an opaque id (one chord
// = one voice group) so multi-touch chords can be released independently.
export interface SynthPort {
  // Unlock/resume the audio backend on the first user gesture.
  resume(): void;
  // Start a voice group of frequencies (Hz). Re-calling with the same id
  // replaces that group (used for the live joystick morph).
  noteOn(voiceId: string, freqs: number[]): void;
  // Release a voice group's envelope.
  noteOff(voiceId: string): void;
  // Release every sounding voice immediately (used by power-off).
  releaseAll(): void;
  setPatch(patch: PatchName): void;
  setVolume(v: number): void; // 0..1
  setStrumMs(ms: number): void; // chord spread per note
  setMuted(muted: boolean): void; // power gate
}
