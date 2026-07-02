import type { Midi } from '../domain/keyboard';

// Ports = the narrow interfaces the application depends on. Concrete adapters (Web Audio,
// a test stub) live in infrastructure and implement these. The application/domain never
// import a vendor SDK or framework directly.

// The StyloClone's voices. BUZZ is the faithful relaxation-oscillator tone of the 1968
// original; ROUND + REED are the two extra sounds the S1 reissue added (a mellower filtered
// tone and a more nasal reed). Kept minimal - this is the simple instrument.
export type VoiceName = 'BUZZ' | 'ROUND' | 'REED';

export const VOICE_ORDER: readonly VoiceName[] = ['BUZZ', 'ROUND', 'REED'];

// The audio output port. The instrument is strictly MONOPHONIC: one voice, retriggered as
// the stylus touches a new key (a natural legato slur when dragged across keys).
export interface StylophonePort {
  // Unlock/resume the audio backend on the first user gesture.
  resume(): void;
  // (Re)start the single voice at this MIDI pitch. Calling again while sounding retriggers
  // to the new pitch (the stylus slid onto another key).
  noteOn(midi: Midi): void;
  // Release the voice (the stylus lifted off the keyboard).
  noteOff(): void;
  // The ~7 Hz vibrato on/off (the front switch).
  setVibrato(on: boolean): void;
  // The tune pot, as a global detune offset in cents.
  setTune(cents: number): void;
  // Master volume 0..1.
  setVolume(v: number): void;
  // Select the voice (BUZZ + the two reissue alternates).
  setVoice(name: VoiceName): void;
  // Power gate: mute everything and release any sounding voice.
  setMuted(muted: boolean): void;
}

// Durable settings, persisted per instrument. Transient state (the held key, power,
// inspect) is NOT saved - only the musical preferences survive a reload.
export interface StylophoneSettings {
  readonly voice: VoiceName;
  readonly vibrato: boolean;
  readonly tune: number; // cents, clamped
  readonly volume: number; // 0..1
}

export interface SettingsStore {
  load(): StylophoneSettings | null;
  save(s: StylophoneSettings): void;
}
