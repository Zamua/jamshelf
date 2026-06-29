import type { DrumName, DrumKit } from '../domain/music';

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
  | 'PLUCK'
  | 'SUPER'
  | 'HUGE'
  | 'NEON'
  | 'REESE'
  | 'NEURO';

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
  'SUPER',
  'HUGE',
  'NEON',
  'REESE',
  'NEURO',
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

// The loop recorder, as the application sees it. The concrete adapter records the
// synth's RENDERED AUDIO (not note events) off a tap on the live output, so every
// layer is frozen the moment it is captured - immune to any later sound / play-mode
// / fx change. Track 1 (the master) sets the loop length; later layers are aligned
// to that loop's boundary. Driven by a single click (the joystick) that cycles
// idle -> armed -> rec -> play, plus a separate clear.
export type LooperMode = 'idle' | 'armed' | 'rec' | 'play';

// What the UI needs to render the looper (kept tiny + serializable).
export interface LooperView {
  readonly mode: LooperMode;
  readonly recTrack: number; // 0-based track being recorded, or -1
  readonly trackCount: number; // finalized loop layers
  readonly selected: number; // the layer the cursor is on (for clear/redo)
  readonly loopBars: number; // the loop's length in whole bars (0 until set)
  readonly bar: number; // current bar of the playhead, 1-based (0 when not playing)
  readonly beat: number; // current beat within the bar, 1-based (0 when not playing)
  readonly stopped: boolean; // layers halted by a joystick-down stop
  readonly countdown: number; // overdub count-in clicks remaining (0 = none)
  readonly posFraction: number; // 0..1 playhead within the loop
}

export interface AudioLooper {
  // The joystick click: advance idle -> armed -> rec -> play -> (overdub) rec ...
  // When it arms the master it does NOT start capturing yet - capture begins at the
  // first key (noteStarted), so there is no leading silence.
  toggle(): void;
  // While a loop plays, move the selection cursor over the recorded layers (the
  // joystick left/right when no pad is held). No-op outside play.
  selectTrack(dir: -1 | 1): void;
  // Joystick down: stop all layers / resume them from the top (bar 1).
  toggleStop(): void;
  // Long-press: clear the SELECTED layer while playing (the master, layer 0, clears
  // everything since it defines the loop length); otherwise wipe everything.
  clear(): void;
  // The controller calls this on every pad press. While armed it starts the master
  // capture at this instant (the first note = the loop's downbeat); otherwise no-op.
  noteStarted(): void;
  // The controller calls this on every pad release: while recording the master it
  // marks where the playing ended, so the loop quantizes on the notes, not the tail.
  noteEnded(): void;
  // Tempo for the metronome + the beat-snap of the master loop length.
  setBpm(bpm: number): void;
  view(): LooperView;
  onChange(cb: () => void): void;
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
  // Global pitch bend in cents (LEAD mode joystick: X = bend, Y = octave). 0 = none.
  setBend(cents: number): void;
  // Fire a one-shot synthesized drum hit (DRUM mode), tuned for the given kit.
  drum(name: DrumName, kit: DrumKit): void;
  // Toggle the global delay / chorus effects; delayMs is the (tempo-synced) delay.
  setFx(delay: boolean, chorus: boolean, delayMs: number): void;
}
