import type { Transport } from '../../../../transport/transport';
import { TRACK_COUNT, type TrackState } from '../../domain/loopStation';

// The LoopClone audio engine: taps the rig's shared input bus (the summed outputs of the devices
// wired in), records it into per-track stereo loop buffers quantized to the shared beat, and plays
// each track back through its own gain (fader level x mute x solo). Recording is TEMPORAL (whatever
// is playing on the wired sources when you hit record), faithful to the RC-505. The first recorded
// track sets the loop length (a whole number of bars); the rest match it. Undo/redo per track keeps
// a bounded stack of buffer states so a record or overdub can be reverted.
//
// Timing note: the transport runs on the wall clock and audio on the ctx clock (the "two clocks");
// we anchor the loop grid to the ctx-time of a transport downbeat, so loops stay ~bar-aligned to the
// drums (within one audio buffer). Sample-tight sync is a later refinement.

const PULSES_PER_BAR = 96; // Transport PPQN(24) * BEATS_PER_BAR(4)
const TAP_SIZE = 4096;
const UNDO_MAX = 8;

interface Track {
  state: TrackState;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  readonly gain: GainNode;
  level: number;
  muted: boolean;
  undo: (AudioBuffer | null)[];
  redo: (AudioBuffer | null)[];
}

export interface EngineTrackView {
  state: TrackState;
  level: number;
  muted: boolean;
  soloed: boolean;
}

export class LoopEngine {
  private readonly ctx: AudioContext;
  private readonly transport: Transport;
  private readonly tap: ScriptProcessorNode;
  private readonly tracks: Track[];
  private readonly notify: () => void;
  private readonly offPos: () => void;

  private loopLenSamples = 0; // set by the first recorded track
  private loopBars = 0;
  private anchorTime = 0; // ctx time of the loop's bar 1

  // capture
  private capTrack = -1; // track index currently being captured (-1 = none)
  private capOverdub = false;
  private capL: Float32Array[] = [];
  private capR: Float32Array[] = [];
  private capCount = 0;
  private pending = -1; // a track armed, waiting for the next downbeat to start
  private pendingOverdub = false;

  private readonly solos = new Set<number>();

  constructor(ctx: AudioContext, input: AudioNode, out: AudioNode, transport: Transport, notify: () => void) {
    this.ctx = ctx;
    this.transport = transport;
    this.notify = notify;
    this.tracks = Array.from({ length: TRACK_COUNT }, () => {
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      gain.connect(out);
      return { state: 'empty' as TrackState, buffer: null, source: null, gain, level: 0.8, muted: false, undo: [], redo: [] };
    });
    // tap the input bus (record only); a silent sink keeps the ScriptProcessor running
    const tap = ctx.createScriptProcessor(TAP_SIZE, 2, 2);
    tap.onaudioprocess = (e) => this.onAudio(e);
    input.connect(tap);
    tap.connect(ctx.destination);
    this.tap = tap;
    // watch the beat: an armed track starts capturing on the next bar downbeat (aligns to the drums)
    this.offPos = transport.onPosition(() => this.onPulse());
  }

  // --- per-pulse: kick off a pending record on the next bar downbeat ---
  private onPulse(): void {
    if (this.pending < 0) return;
    if (this.transport.position().pulse % PULSES_PER_BAR !== 0) return; // wait for a bar downbeat
    const i = this.pending;
    this.pending = -1;
    this.startCapture(i, this.pendingOverdub);
  }

  // Begin capturing the input bus into track i. The first non-overdub take anchors the loop grid.
  private startCapture(i: number, overdub: boolean): void {
    if (this.loopLenSamples === 0 && !overdub) this.anchorTime = this.ctx.currentTime;
    this.capTrack = i;
    this.capOverdub = overdub;
    this.capL = [];
    this.capR = [];
    this.capCount = 0;
    this.tracks[i].state = overdub ? 'overdub' : 'recording';
    this.notify();
  }

  // Arm a record: quantize to the next downbeat when the beat is running, else start now (solo).
  private arm(i: number, overdub: boolean): void {
    if (this.transport.isAdvancing()) {
      this.pending = i;
      this.pendingOverdub = overdub;
      if (!overdub) this.tracks[i].state = 'recording'; // armed indicator until the downbeat
    } else {
      this.startCapture(i, overdub);
    }
  }
  private cancelArm(i: number): void {
    if (this.pending === i) this.pending = -1;
    this.tracks[i].state = 'empty';
  }

  // --- the tap: accumulate the input bus while a track is capturing ---
  private onAudio(e: AudioProcessingEvent): void {
    if (this.capTrack < 0) return;
    this.capL.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    this.capR.push(new Float32Array(e.inputBuffer.getChannelData(1)));
    this.capCount += e.inputBuffer.length;
    // a non-first track (loop length known) auto-closes after exactly one loop
    if (this.loopLenSamples > 0 && this.capCount >= this.loopLenSamples) this.finishCapture();
  }

  // --- the big round button: record -> play -> overdub -> play, or resume a stopped track ---
  button(i: number): void {
    const t = this.tracks[i];
    switch (t.state) {
      case 'empty':
        this.arm(i, false);
        break;
      case 'recording':
        if (this.capTrack === i) this.finishCapture(); // close the loop (first track sets the length)
        else this.cancelArm(i); // was armed but not yet capturing -> cancel
        break;
      case 'playing':
        this.arm(i, true); // overdub
        break;
      case 'overdub':
        this.finishCapture();
        break;
      case 'stopped':
        this.startPlayback(i);
        t.state = 'playing';
        break;
    }
    this.notify();
  }

  private barSamples(): number {
    const bpm = this.transport.getBpm();
    return Math.max(1, Math.round((this.ctx.sampleRate * 60) / bpm)) * 4;
  }

  // Close the current capture into the track's buffer + start it looping.
  private finishCapture(): void {
    const i = this.capTrack;
    if (i < 0) return;
    const t = this.tracks[i];
    const overdub = this.capOverdub;
    this.capTrack = -1;
    this.capOverdub = false;

    if (this.loopLenSamples === 0) {
      // first track: snap the captured length to a whole number of bars (>= 1)
      const bar = this.barSamples();
      this.loopBars = Math.max(1, Math.round(this.capCount / bar));
      this.loopLenSamples = this.loopBars * bar;
    }
    const len = this.loopLenSamples;
    const buf = t.buffer && overdub ? this.copyBuffer(t.buffer) : this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    // fold the captured samples into the buffer (wrap-add so a tail past the bar returns to the top)
    const cap = [flatten(this.capL), flatten(this.capR)];
    for (let ch = 0; ch < 2; ch++) {
      const dst = buf.getChannelData(ch);
      const src = cap[ch];
      for (let n = 0; n < src.length; n++) dst[n % len] += src[n];
    }
    // undo: remember what the track was before this take
    this.pushUndo(t, overdub ? t.buffer : null);
    t.buffer = buf;
    t.state = 'playing';
    this.startPlayback(i);
    this.notify();
  }

  // Start (or restart) a track's loop source, phase-aligned to the loop grid.
  private startPlayback(i: number): void {
    const t = this.tracks[i];
    if (!t.buffer) return;
    this.stopSource(t);
    const src = this.ctx.createBufferSource();
    src.buffer = t.buffer;
    src.loop = true;
    src.connect(t.gain);
    // start at the next loop boundary so every track is phase-locked to bar 1
    const lenSec = this.loopLenSamples / this.ctx.sampleRate;
    const now = this.ctx.currentTime;
    const elapsed = now - this.anchorTime;
    const boundary = this.anchorTime + Math.max(0, Math.ceil(elapsed / lenSec)) * lenSec;
    const at = Math.max(now + 0.02, boundary);
    src.start(at);
    t.source = src;
    this.applyGain(t, i);
  }

  private stopSource(t: Track): void {
    if (t.source) {
      try {
        t.source.onended = null;
        t.source.stop();
        t.source.disconnect();
      } catch {
        /* already stopped */
      }
      t.source = null;
    }
  }

  // --- mute / solo / level ---
  private applyGain(t: Track, i: number): void {
    const soloActive = this.solos.size > 0;
    const audible = !t.muted && (!soloActive || this.solos.has(i));
    t.gain.gain.setTargetAtTime(audible ? t.level : 0, this.ctx.currentTime, 0.015);
  }
  private applyAllGains(): void {
    this.tracks.forEach((t, i) => this.applyGain(t, i));
  }

  setLevel(i: number, level: number): void {
    const t = this.tracks[i];
    t.level = Math.max(0, Math.min(1, level));
    this.applyGain(t, i);
    this.notify();
  }
  mute(i: number): void {
    const t = this.tracks[i];
    t.muted = !t.muted; // phase-preserving: the loop keeps running, silenced
    this.applyGain(t, i);
    this.notify();
  }
  solo(i: number): void {
    if (this.solos.has(i)) this.solos.delete(i);
    else this.solos.add(i);
    this.applyAllGains();
    this.notify();
  }

  // The stop button: mute (the loop keeps running in sync).
  stop(i: number): void {
    this.mute(i);
  }
  // ALL: start/stop (mute all / unmute all).
  allStop(): void {
    const anyLive = this.tracks.some((t) => t.buffer && !t.muted);
    this.tracks.forEach((t, i) => {
      if (t.buffer) t.muted = anyLive;
      this.applyGain(t, i);
    });
    this.notify();
  }

  clear(i: number): void {
    const t = this.tracks[i];
    this.pushUndo(t, t.buffer);
    this.stopSource(t);
    t.buffer = null;
    t.state = 'empty';
    t.muted = false;
    this.solos.delete(i);
    if (this.tracks.every((x) => !x.buffer)) {
      this.loopLenSamples = 0; // last loop gone -> the next record sets a fresh length
      this.loopBars = 0;
    }
    this.notify();
  }

  // --- undo / redo per track ---
  private pushUndo(t: Track, prev: AudioBuffer | null): void {
    t.undo.push(prev);
    if (t.undo.length > UNDO_MAX) t.undo.shift();
    t.redo = [];
  }
  undo(i: number): void {
    const t = this.tracks[i];
    if (t.undo.length === 0) return;
    t.redo.push(t.buffer);
    const prev = t.undo.pop() ?? null;
    this.applyBuffer(t, i, prev);
    this.notify();
  }
  redo(i: number): void {
    const t = this.tracks[i];
    if (t.redo.length === 0) return;
    t.undo.push(t.buffer);
    const next = t.redo.pop() ?? null;
    this.applyBuffer(t, i, next);
    this.notify();
  }
  private applyBuffer(t: Track, i: number, buf: AudioBuffer | null): void {
    t.buffer = buf;
    if (buf) {
      t.state = 'playing';
      this.startPlayback(i);
    } else {
      this.stopSource(t);
      t.state = 'empty';
    }
  }

  // --- views + teardown ---
  view(): EngineTrackView[] {
    return this.tracks.map((t, i) => ({ state: t.state, level: t.level, muted: t.muted, soloed: this.solos.has(i) }));
  }
  canUndo(i: number): boolean {
    return this.tracks[i].undo.length > 0;
  }

  dispose(): void {
    this.offPos();
    this.tracks.forEach((t) => this.stopSource(t));
    try {
      this.tap.disconnect();
      this.tap.onaudioprocess = null;
    } catch {
      /* ignore */
    }
  }

  private copyBuffer(b: AudioBuffer): AudioBuffer {
    const c = this.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let ch = 0; ch < b.numberOfChannels; ch++) c.getChannelData(ch).set(b.getChannelData(ch));
    return c;
  }
}

function flatten(chunks: Float32Array[]): Float32Array {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
