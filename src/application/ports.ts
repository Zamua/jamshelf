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

// A BPM-synced tick source. Timing lives HERE (a port), never in the domain, so
// the controller's arpeggiator / repeat logic is driven by clock ticks and stays
// fully testable with a fake clock. The controller sets the tempo + subdivision
// and subscribes; the adapter decides how to schedule (interval, audio clock...).
export interface Clock {
  setBpm(bpm: number): void;
  setBeatsPerTick(beats: number): void; // e.g. rateBeats(rate) from the domain
  start(): void;
  stop(): void;
  onTick(cb: () => void): () => void; // subscribe; returns an unsubscribe fn
}

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
