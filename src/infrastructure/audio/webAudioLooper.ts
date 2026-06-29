import type { AudioLooper, LooperMode, LooperView } from '../../application/ports';
import type { WebAudioSynth } from './webAudioSynth';

// An AUDIO loop recorder: it records the synth's rendered output (not note events)
// off a tap on the live bus, so every layer is frozen the instant it is captured -
// switching patch / play-mode / fx afterwards never alters a recorded loop.
//
// The state machine, driven by the joystick click (`toggle`):
//   idle  --click-->  armed   (waiting for the first key; nothing recorded yet)
//   armed --key---->  rec      (the FIRST key starts the master capture - no
//                               leading silence; that note is the loop's downbeat)
//   rec(master) --click--> play (master length is snapped to a whole number of
//                               beats so the metronome + overdubs lock to the loop)
//   play  --click-->  rec      (overdub: a new layer, recorded for one loop and
//                               aligned to the loop boundary - whole-track, not
//                               per-note quantize)
//   rec(overdub) --click--> play
// Long-press (`clear`) wipes every layer back to idle.
//
// A metronome clicks while arming + recording so layers can be played in time; it
// routes to the synth's loop bus, so it is never captured into a recording.

const MAX_TRACKS = 6;
const BEATS_PER_BAR = 4; // 4/4 - the master loop is snapped to whole bars
const BUFFER_SIZE = 2048; // ScriptProcessor block (~46ms @ 44.1k) - safe on iOS
const LOOKAHEAD_MS = 25; // metronome scheduler poll interval
const SCHEDULE_AHEAD = 0.12; // seconds of click events to schedule each poll

interface Track {
  source: AudioBufferSourceNode;
}

export class WebAudioLooper implements AudioLooper {
  private readonly synth: WebAudioSynth;
  private ctx: AudioContext | null = null;
  private live: AudioNode | null = null; // tap source (full live mix)
  private loopOut: AudioNode | null = null; // loop + metronome out (untapped)
  private script: ScriptProcessorNode | null = null;

  private mode: LooperMode = 'idle';
  private tracks: Track[] = [];
  private recTrack = -1;
  private bpm = 120;

  // master capture (growable list of input blocks)
  private masterChunks: [Float32Array[], Float32Array[]] = [[], []];
  // overdub capture (fixed loop length, written phase-aligned)
  private overdub: [Float32Array, Float32Array] | null = null;
  private capturing = false; // copy input blocks this audio frame?

  private loopLenSamples = 0; // master loop length (defines every layer)
  private loopBeats = 0; // its length in whole beats (locks the metronome)
  private loopBars = 0; // its length in whole bars (BEATS_PER_BAR beats each)
  private anchorTime = 0; // ctx time of loop phase 0 (the first note)

  // metronome
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private metroAnchor = 0; // ctx time of beat 0
  private metroBeat = 0; // next beat index to schedule

  private listeners = new Set<() => void>();

  constructor(synth: WebAudioSynth) {
    this.synth = synth;
  }

  onChange(cb: () => void): void {
    this.listeners.add(cb);
  }
  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  view(): LooperView {
    let pos = 0;
    if (this.ctx && this.loopLenSamples > 0 && this.mode === 'play') {
      const lenSec = this.loopLenSamples / this.ctx.sampleRate;
      const t = (((this.ctx.currentTime - this.anchorTime) % lenSec) + lenSec) % lenSec;
      pos = t / lenSec;
    }
    return {
      mode: this.mode,
      recTrack: this.recTrack,
      trackCount: this.tracks.length,
      loopBars: this.loopBars,
      posFraction: pos,
    };
  }

  toggle(): void {
    if (!this.ensureGraph()) return;
    switch (this.mode) {
      case 'idle':
        // arm the master; capture waits for the first key (noteStarted)
        this.mode = 'armed';
        this.recTrack = 0;
        this.startMetronome(this.ctx!.currentTime + 0.12);
        break;
      case 'armed':
        // cancel before any note was played
        this.mode = 'idle';
        this.recTrack = -1;
        this.stopMetronome();
        break;
      case 'rec':
        if (this.recTrack === 0) this.finalizeMaster();
        else this.finalizeOverdub();
        break;
      case 'play':
        if (this.tracks.length < MAX_TRACKS) this.startOverdub();
        break;
    }
    this.emit();
  }

  noteStarted(): void {
    if (this.mode !== 'armed' || !this.ctx) return;
    // The first key of the master take: start capturing rendered audio NOW and make
    // this instant the loop's downbeat (re-anchor the metronome to it).
    this.mode = 'rec';
    this.recTrack = 0;
    this.masterChunks = [[], []];
    this.capturing = true;
    this.anchorTime = this.ctx.currentTime;
    this.startMetronome(this.anchorTime);
    this.emit();
  }

  clear(): void {
    for (const t of this.tracks) this.stopSource(t.source);
    this.tracks = [];
    this.mode = 'idle';
    this.recTrack = -1;
    this.capturing = false;
    this.overdub = null;
    this.masterChunks = [[], []];
    this.loopLenSamples = 0;
    this.loopBeats = 0;
    this.loopBars = 0;
    this.stopMetronome();
    this.emit();
  }

  // --- recording lifecycle -------------------------------------------------
  private finalizeMaster(): void {
    this.capturing = false;
    const ctx = this.ctx!;
    const left = concat(this.masterChunks[0]);
    const right = concat(this.masterChunks[1]);
    this.masterChunks = [[], []];

    // Snap the loop length to a whole number of BARS at the current tempo (round to
    // nearest, min 1 bar) so the metronome + every later layer lock to it. Snapping
    // to bars (not beats) means a small overshoot past the bar line rounds back DOWN
    // to a clean bar count instead of tacking on a stray beat: a tail has to exceed
    // half a bar before it counts as another bar.
    const beatSamples = Math.max(1, Math.round((ctx.sampleRate * 60) / this.bpm));
    const barSamples = beatSamples * BEATS_PER_BAR;
    this.loopBars = Math.max(1, Math.round(left.length / barSamples));
    this.loopBeats = this.loopBars * BEATS_PER_BAR;
    this.loopLenSamples = this.loopBars * barSamples;

    const buf = ctx.createBuffer(2, this.loopLenSamples, ctx.sampleRate);
    copyInto(buf.getChannelData(0), left);
    copyInto(buf.getChannelData(1), right);

    // The loop's phase 0 is the first note (anchorTime, set in noteStarted). Start
    // the looping source on the next loop boundary so playback is seamless.
    const startAt = this.nextBoundary();
    this.tracks.push({ source: this.startLoop(buf, startAt) });
    this.recTrack = -1;
    this.mode = 'play';
    this.stopMetronome();
  }

  private startOverdub(): void {
    this.recTrack = this.tracks.length;
    this.overdub = [new Float32Array(this.loopLenSamples), new Float32Array(this.loopLenSamples)];
    this.capturing = true;
    this.mode = 'rec';
    this.startMetronome(this.metroBeatBefore(this.ctx!.currentTime));
  }

  private finalizeOverdub(): void {
    this.capturing = false;
    const ctx = this.ctx!;
    const od = this.overdub!;
    this.overdub = null;
    const buf = ctx.createBuffer(2, this.loopLenSamples, ctx.sampleRate);
    buf.getChannelData(0).set(od[0]);
    buf.getChannelData(1).set(od[1]);
    this.tracks.push({ source: this.startLoop(buf, this.nextBoundary()) });
    this.recTrack = -1;
    this.mode = 'play';
    this.stopMetronome();
  }

  private startLoop(buf: AudioBuffer, at: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.loopOut!);
    src.start(at);
    return src;
  }

  // The next loop boundary (a multiple of the loop length from the anchor) at or
  // after now - where a freshly recorded layer should begin so it is phase-locked.
  private nextBoundary(): number {
    const ctx = this.ctx!;
    const lenSec = this.loopLenSamples / ctx.sampleRate;
    const elapsed = ctx.currentTime - this.anchorTime;
    return this.anchorTime + Math.max(0, Math.ceil(elapsed / lenSec)) * lenSec;
  }

  private stopSource(src: AudioBufferSourceNode): void {
    try {
      src.stop();
      src.disconnect();
    } catch {
      /* already stopped */
    }
  }

  // --- the audio-thread tap ------------------------------------------------
  private ensureGraph(): boolean {
    if (this.script) return true;
    const g = this.synth.audioGraph();
    if (!g) return false;
    this.ctx = g.ctx;
    this.live = g.live;
    this.loopOut = g.loopOut;
    const script = this.ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);
    script.onaudioprocess = (e) => this.process(e);
    // ScriptProcessor only runs while connected to the destination; route its
    // (unused) output through a silent gain so it pulls without making sound. The
    // gain stays alive via its connection in the graph (script -> sink -> out).
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.live.connect(script);
    script.connect(sink);
    sink.connect(this.ctx.destination);
    this.script = script;
    return true;
  }

  private process(e: AudioProcessingEvent): void {
    if (!this.capturing) return;
    const inBuf = e.inputBuffer;
    const inL = inBuf.getChannelData(0);
    const inR = inBuf.numberOfChannels > 1 ? inBuf.getChannelData(1) : inL;
    if (this.recTrack === 0) {
      // master: accumulate the raw blocks; length defines the loop
      this.masterChunks[0].push(new Float32Array(inL));
      this.masterChunks[1].push(new Float32Array(inR));
      return;
    }
    if (!this.overdub || this.loopLenSamples <= 0) return;
    // overdub: fold the input into the fixed-length buffer at its loop phase, so
    // the whole layer aligns to the loop boundary (one block of input latency is
    // backed out so the layer is not played a block late).
    const sr = this.ctx!.sampleRate;
    const len = this.loopLenSamples;
    const startPhase = Math.round((e.playbackTime - this.anchorTime) * sr) - BUFFER_SIZE;
    const l = this.overdub[0];
    const r = this.overdub[1];
    for (let i = 0; i < inL.length; i++) {
      let p = (startPhase + i) % len;
      if (p < 0) p += len;
      l[p] = inL[i];
      r[p] = inR[i];
    }
  }

  // --- metronome -----------------------------------------------------------
  // Clicks on the beat while arming + recording so layers stay in time. Once a loop
  // exists, the click interval is the loop's own beat (loopLen / loopBeats) so it
  // can never drift against the loop, even if the tempo knob moves afterward.
  private beatSec(): number {
    if (this.loopBeats > 0 && this.loopLenSamples > 0 && this.ctx)
      return this.loopLenSamples / this.loopBeats / this.ctx.sampleRate;
    return 60 / this.bpm;
  }
  // The most recent beat time at or before `t` (used to phase an overdub's clicks
  // onto the existing loop grid).
  private metroBeatBefore(t: number): number {
    const b = this.beatSec();
    const n = Math.floor((t - this.anchorTime) / b);
    return this.anchorTime + n * b;
  }
  private startMetronome(anchor: number): void {
    this.stopMetronome();
    if (!this.ctx) return;
    this.metroAnchor = anchor;
    this.metroBeat = Math.max(0, Math.ceil((this.ctx.currentTime - anchor) / this.beatSec()));
    this.metroTimer = setInterval(() => this.scheduleClicks(), LOOKAHEAD_MS);
    this.scheduleClicks();
  }
  private stopMetronome(): void {
    if (this.metroTimer !== null) {
      clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
  }
  private scheduleClicks(): void {
    if (!this.ctx) return;
    const b = this.beatSec();
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD;
    // Accents must land on the TRUE bar grid (1-2-3-4 | 1-2-3-4). Once a loop exists
    // we count beats from the loop's first-note anchor, NOT from this metronome's own
    // anchor - an overdub's metronome restarts on whatever beat boundary is nearest,
    // which may fall mid-bar, and keying the accent off it would drop/shift the accent
    // for later tracks. Before a loop is set (the count-in), the metronome anchor IS
    // the grid origin, so either reference agrees.
    const accentRef = this.loopBars > 0 ? this.anchorTime : this.metroAnchor;
    let t = this.metroAnchor + this.metroBeat * b;
    while (t < horizon) {
      const beatIdx = Math.round((t - accentRef) / b);
      this.click(t, (((beatIdx % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) === 0);
      this.metroBeat++;
      t = this.metroAnchor + this.metroBeat * b;
    }
  }
  private click(at: number, accent: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1600 : 1000;
    const g = ctx.createGain();
    const peak = accent ? 0.16 : 0.1;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
    osc.connect(g);
    g.connect(this.loopOut!); // untapped bus => never recorded
    osc.start(at);
    osc.stop(at + 0.06);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }
}

// Concatenate the captured input blocks into one contiguous buffer.
function concat(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Copy `src` into `dst`, truncating or zero-padding to dst's length (the master is
// snapped to a whole number of beats, so it may be a hair shorter/longer).
function copyInto(dst: Float32Array, src: Float32Array): void {
  dst.set(src.length > dst.length ? src.subarray(0, dst.length) : src);
}
