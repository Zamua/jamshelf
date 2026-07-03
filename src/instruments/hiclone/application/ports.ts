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
  | 'NEURO'
  | 'ROLLER'
  | 'GROWLER'
  | 'NFUNK'
  | 'FMBASS'
  | 'BLOOM';

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
  'ROLLER',
  'GROWLER',
  'NFUNK',
  'FMBASS',
  'BLOOM',
];

// Control over the shared Transport that recording needs, as a NARROW port (ports-and-adapters):
// the looper never touches the Transport directly, only "halt the rig for the count-in" and "rewind
// to bar 1 and play again". The composition root supplies the adapter (which also restores the
// solo free-run vs rig play mode). This is what makes a recorded loop lock to the beat: the loop's
// bar 1 and the rig's bar 1 become the same transport bar 1 by construction.
export interface TransportControl {
  suspend(): void; // halt the shared clock while counting in
  resumeFromTop(): void; // rewind to bar 1 and resume (the drums replay from the top)
}

// The loop recorder, as the application sees it. The concrete adapter records the
// synth's RENDERED AUDIO (not note events) off a tap on the live output, so every
// layer is frozen the moment it is captured - immune to any later sound / play-mode
// / fx change. Track 1 (the master) sets the loop length; later layers are aligned
// to that loop's boundary. Driven by a single click (the joystick) that cycles
// idle -> rec -> play, plus a separate clear. Recording (master OR overdub) halts the
// rig, counts in, then restarts from bar 1 and captures - so the loop locks to the beat.
export type LooperMode = 'idle' | 'rec' | 'play';

// What the UI needs to render the looper (kept tiny + serializable).
export interface LooperView {
  readonly active: boolean; // in looper MODE (entered via joystick click; exit via up)
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
  // The joystick click. The FIRST click ENTERS looper mode; subsequent clicks advance
  // idle -> rec -> play -> (overdub) rec ... Starting a take (master OR overdub) halts the
  // rig, counts in 4 beats, then restarts from bar 1 and captures - the loop's downbeat IS
  // the transport downbeat, so it locks to the beat.
  click(): void;
  // Joystick UP: exit looper mode and stop playback. Any take is finalized; loops are kept
  // (stopped), so re-entering + a down-flick resumes them.
  exit(): void;
  // While a loop plays, move the selection cursor over the recorded layers (the
  // joystick left/right when no pad is held). No-op outside play.
  selectTrack(dir: -1 | 1): void;
  // Joystick down (SOLO): stop all layers / resume them from the top (bar 1).
  toggleStop(): void;
  // Follow the shared transport (a RIG): play resumes the loops, pause holds them at their phase,
  // stop (atStart) returns them to bar 1. Driven by the controller off the transport's state.
  followTransport(playing: boolean, atStart: boolean): void;
  // Long-press: clear the SELECTED layer while playing (the master, layer 0, clears
  // everything since it defines the loop length); otherwise wipe everything.
  clear(): void;
  // The controller calls this on every pad press. While capturing the master it marks the
  // last-played instant (the master anchors to bar 1, not the first note), so the loop length
  // quantizes on the notes; otherwise no-op.
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
  // Retune a SOUNDING voice group to new pitches WITHOUT re-attacking (the legato chord
  // morph). Falls back to noteOn if the group is not currently held.
  retune(voiceId: string, freqs: number[], patch?: PatchName): void;
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
  // Portamento time in seconds: a mono note glides in pitch from the last one. 0 = off.
  setGlide(seconds: number): void;
  // Fire a one-shot synthesized drum hit (DRUM mode), tuned for the given kit.
  drum(name: DrumName, kit: DrumKit): void;
  // Toggle the global delay / chorus effects; delayMs is the (tempo-synced) delay.
  setFx(delay: boolean, chorus: boolean, delayMs: number): void;
}
