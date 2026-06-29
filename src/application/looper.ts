import type { PatchName, SynthPort, Ticker } from './ports';

// A multi-track loop recorder. It records the actual note events the player makes
// (each tagged with its instrument), and loops them back, so you can layer chord
// progressions / arps / melodies with different sounds. EVENT-based (not audio
// recording): clean, small, and each track keeps its own instrument.
//
// The state machine is driven by a single "toggle" (the joystick click):
//   idle --click--> recording TRACK 0 (the master; its length defines the loop)
//   rec(master) --click--> playing (loop begins)
//   playing --click--> recording the next empty track (overdub, synced to the loop)
//   rec(overdub) --click--> playing
// A separate "clear" wipes everything back to idle.

export type LooperMode = 'idle' | 'rec' | 'play';

interface LoopEvent {
  at: number; // ms from the loop start
  on: boolean; // true = noteOn, false = noteOff
  voiceId: string;
  freqs: number[];
  patch: PatchName;
}
interface Track {
  events: LoopEvent[];
  muted: boolean;
}

// What the UI needs to render the looper state (kept tiny + serializable).
export interface LooperView {
  readonly mode: LooperMode;
  readonly recTrack: number; // 0-based track being recorded, or -1
  readonly trackCount: number; // tracks with content
  readonly posFraction: number; // 0..1 playhead within the loop
}

const MAX_TRACKS = 6;
const MIN_LOOP_MS = 200;

export class Looper {
  private readonly synth: SynthPort;
  private readonly ticker: Ticker;
  private tracks: Track[] = [];
  private mode: LooperMode = 'idle';
  private loopLenMs: number | null = null;
  private anchorMs = 0; // wall-clock time that playhead 0 corresponds to
  private posMs = 0;
  private recTrack = -1;
  private active = new Set<string>(); // currently-sounding loop voice ids
  private listeners = new Set<() => void>();

  constructor(synth: SynthPort, ticker: Ticker) {
    this.synth = synth;
    this.ticker = ticker;
  }

  onChange(cb: () => void): void {
    this.listeners.add(cb);
  }
  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  view(): LooperView {
    return {
      mode: this.mode,
      recTrack: this.recTrack,
      trackCount: this.tracks.filter((t) => t.events.length > 0).length,
      posFraction: this.loopLenMs ? this.posMs / this.loopLenMs : 0,
    };
  }

  // The joystick click: advance the record/play state machine.
  toggle(nowMs: number): void {
    if (this.mode === 'idle') {
      this.startRecording(0, nowMs);
    } else if (this.mode === 'rec' && this.loopLenMs === null) {
      // finishing the MASTER track: its length defines the loop
      this.loopLenMs = Math.max(MIN_LOOP_MS, nowMs - this.anchorMs);
      this.finishRecording();
      this.mode = 'play';
    } else if (this.mode === 'rec') {
      this.finishRecording(); // finishing an overdub
      this.mode = 'play';
    } else {
      const free = this.tracks.findIndex((t) => t.events.length === 0);
      if (free !== -1) this.startRecording(free, nowMs); // overdub the next free track
    }
    this.emit();
  }

  // Wipe everything back to idle.
  clear(): void {
    this.stopActive();
    this.ticker.stop();
    this.tracks = [];
    this.mode = 'idle';
    this.loopLenMs = null;
    this.posMs = 0;
    this.recTrack = -1;
    this.emit();
  }

  // Called (by the recording synth decorator) for every live note while recording.
  capture(on: boolean, voiceId: string, freqs: number[], patch: PatchName): void {
    if (this.mode !== 'rec' || this.recTrack < 0) return;
    this.tracks[this.recTrack].events.push({ at: this.posMs, on, voiceId, freqs, patch });
  }

  // --- internals ----------------------------------------------------------
  private startRecording(idx: number, nowMs: number): void {
    if (this.tracks.length === 0) {
      this.tracks = Array.from({ length: MAX_TRACKS }, () => ({ events: [], muted: false }));
    }
    this.tracks[idx] = { events: [], muted: false };
    this.recTrack = idx;
    this.mode = 'rec';
    if (idx === 0 && this.loopLenMs === null) {
      this.anchorMs = nowMs; // the master defines playhead 0
      this.posMs = 0;
    }
    this.ticker.start((n) => this.onFrame(n));
  }
  private finishRecording(): void {
    if (this.recTrack >= 0) this.tracks[this.recTrack].events.sort((a, b) => a.at - b.at);
    this.recTrack = -1;
  }

  private onFrame(nowMs: number): void {
    const prev = this.posMs;
    if (this.loopLenMs === null) {
      this.posMs = nowMs - this.anchorMs; // master recording: playhead grows
      return;
    }
    this.posMs = (((nowMs - this.anchorMs) % this.loopLenMs) + this.loopLenMs) % this.loopLenMs;
    if (this.posMs >= prev) {
      this.fireWindow(prev, this.posMs);
    } else {
      // wrapped: finish this cycle, reset held loop voices (no stuck notes), restart
      this.fireWindow(prev, this.loopLenMs);
      this.stopActive();
      this.fireWindow(0, this.posMs);
    }
  }
  // Fire events in the half-open window [from, to). Half-open (inclusive start) so
  // an event recorded exactly at the loop start (at = 0) fires once per pass.
  private fireWindow(from: number, to: number): void {
    for (let i = 0; i < this.tracks.length; i++) {
      if (i === this.recTrack) continue; // don't play back the track being recorded
      const tr = this.tracks[i];
      if (tr.muted) continue;
      for (const e of tr.events) if (e.at >= from && e.at < to) this.fireEvent(i, e);
    }
  }
  private fireEvent(track: number, e: LoopEvent): void {
    const id = `loop:${track}:${e.voiceId}`;
    if (e.on) {
      this.synth.noteOn(id, e.freqs, e.patch);
      this.active.add(id);
    } else {
      this.synth.noteOff(id);
      this.active.delete(id);
    }
  }
  private stopActive(): void {
    for (const id of this.active) this.synth.noteOff(id);
    this.active.clear();
  }
}
