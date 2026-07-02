import type { DrumVoice, Pattern } from '../domain/sequencer';

// Ports = the narrow interfaces the application depends on. Concrete adapters (Web Audio, an
// interval clock, a test stub) live in infrastructure and implement these.

// The drum audio output. Each voice is a one-shot synthesized hit (no samples). `accent` plays it
// a touch louder (the 808 accent), reserved for later.
export interface DrumMachinePort {
  resume(): void;
  trigger(voice: DrumVoice, accent?: boolean): void;
  setVolume(v: number): void; // 0..1
  setMuted(muted: boolean): void; // power gate
}

// A BPM-synced tick source. SAME shape as the HiClone's Clock so the rig's shared transport can
// implement this identically and drive every instrument. The controller sets the tempo +
// subdivision (a 16th note per step) and subscribes; the adapter schedules the ticks.
export interface Clock {
  setBpm(bpm: number): void;
  setBeatsPerTick(beats: number): void; // 0.25 = a 16th note = one step
  start(): void;
  stop(): void;
  onTick(cb: () => void): () => void; // subscribe; returns an unsubscribe fn
}

// Durable settings, persisted per instrument. The pattern, tempo, volume and selected voice
// survive a reload; transient state (playing, current step, power, inspect) does not.
export interface DrumSettings {
  readonly pattern: Pattern;
  readonly bpm: number;
  readonly volume: number;
  readonly selected: DrumVoice;
}

export interface SettingsStore {
  load(): DrumSettings | null;
  save(s: DrumSettings): void;
}
