import type { DrumName } from '../domain/music';

// Ports = the narrow interfaces the application depends on. Concrete adapters
// (Web Audio, a test stub, ...) live in infrastructure and implement these.
// The application/domain never import a vendor SDK or framework directly.

// The synth voices, modelled on the real device's instrument set: analog
// (subtractive) + 2-operator FM. EPIANO / HX7 / BELL are FM; the rest subtractive.
export type PatchName =
  | 'SAW'
  | 'SINE'
  | 'EPIANO'
  | 'HX7'
  | 'STRINGS'
  | 'CLARINET'
  | 'BELL'
  | 'ORGAN'
  | 'PLUCK';

export const PATCH_ORDER: readonly PatchName[] = [
  'SAW',
  'SINE',
  'EPIANO',
  'HX7',
  'STRINGS',
  'CLARINET',
  'BELL',
  'ORGAN',
  'PLUCK',
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

// A high-resolution frame ticker (the looper uses it to advance the playhead and
// fire recorded events at ~ms accuracy). The adapter implements it with
// requestAnimationFrame; the callback receives a millisecond timestamp.
export interface Ticker {
  start(cb: (nowMs: number) => void): void;
  stop(): void;
}

// The audio output port. Voice groups are addressed by an opaque id (one chord
// = one voice group) so multi-touch chords can be released independently.
export interface SynthPort {
  // Unlock/resume the audio backend on the first user gesture.
  resume(): void;
  // Start a voice group of frequencies (Hz). Re-calling with the same id
  // replaces that group (used for the live joystick morph). An optional patch
  // overrides the current voice for THIS group only (the looper plays each track
  // with its own instrument without disturbing the live patch).
  noteOn(voiceId: string, freqs: number[], patch?: PatchName): void;
  // Release a voice group's envelope.
  noteOff(voiceId: string): void;
  // Release every sounding voice immediately (used by power-off).
  releaseAll(): void;
  setPatch(patch: PatchName): void;
  setVolume(v: number): void; // 0..1
  setStrumMs(ms: number): void; // chord spread per note
  setMuted(muted: boolean): void; // power gate
  // Fire a one-shot synthesized drum hit (DRUM mode).
  drum(name: DrumName): void;
}
