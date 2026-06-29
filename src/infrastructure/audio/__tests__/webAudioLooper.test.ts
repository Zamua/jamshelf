import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAudioLooper } from '../webAudioLooper';
import type { WebAudioSynth } from '../webAudioSynth';

// A minimal fake Web Audio graph: enough surface for the looper to record, loop,
// overdub, and click a metronome, with hand-driven time + audio blocks. This pins
// the looper's LOGIC (state machine, frozen-buffer capture, phase-aligned overdub,
// metronome routing) without a real AudioContext - the sound fidelity is verified
// by ear in the browser.
class FakeParam {
  value = 0;
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  setTargetAtTime(): void {}
}
class FakeNode {
  connections: FakeNode[] = [];
  connect(n: FakeNode): FakeNode {
    this.connections.push(n);
    return n;
  }
  disconnect(): void {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeOsc extends FakeNode {
  type = '';
  frequency = new FakeParam();
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(t: number): void {
    this.started = t;
  }
  stop(t: number): void {
    this.stopped = t;
  }
}
class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  started: number | null = null;
  stopped = false;
  start(t: number): void {
    this.started = t;
  }
  stop(): void {
    this.stopped = true;
  }
}
class FakeBuffer {
  numberOfChannels: number;
  length: number;
  private chans: Float32Array[];
  constructor(ch: number, len: number) {
    this.numberOfChannels = ch;
    this.length = len;
    this.chans = Array.from({ length: ch }, () => new Float32Array(len));
  }
  getChannelData(i: number): Float32Array {
    return this.chans[i];
  }
}
class FakeScript extends FakeNode {
  onaudioprocess: ((e: unknown) => void) | null = null;
  bufferSize: number;
  constructor(bufferSize: number) {
    super();
    this.bufferSize = bufferSize;
  }
}
class FakeCtx {
  sampleRate = 48000;
  currentTime = 0;
  destination = new FakeNode();
  lastScript: FakeScript | null = null;
  sources: FakeBufferSource[] = [];
  oscillators: FakeOsc[] = [];
  createGain(): FakeGain {
    return new FakeGain();
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc();
    this.oscillators.push(o);
    return o;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  createBuffer(ch: number, len: number): FakeBuffer {
    return new FakeBuffer(ch, len);
  }
  createScriptProcessor(bufferSize: number): FakeScript {
    this.lastScript = new FakeScript(bufferSize);
    return this.lastScript;
  }
}

function makeLooper() {
  const ctx = new FakeCtx();
  const live = new FakeNode();
  const loopOut = new FakeGain();
  const synth = { audioGraph: () => ({ ctx, live, loopOut }) } as unknown as WebAudioSynth;
  const looper = new WebAudioLooper(synth);
  return { looper, ctx, live, loopOut };
}

// Fire `count` audio blocks of a constant sample value, advancing the clock by one
// block each time (mirrors the realtime ScriptProcessor pulling input).
function pump(ctx: FakeCtx, value: number, count: number): void {
  const script = ctx.lastScript!;
  const bs = script.bufferSize;
  for (let b = 0; b < count; b++) {
    const inBuf = new FakeBuffer(2, bs);
    inBuf.getChannelData(0).fill(value);
    inBuf.getChannelData(1).fill(value);
    script.onaudioprocess?.({ playbackTime: ctx.currentTime, inputBuffer: inBuf });
    ctx.currentTime += bs / ctx.sampleRate;
  }
}

describe('WebAudioLooper', () => {
  it('arms without recording, then captures the master starting at the first key', () => {
    const { looper, ctx } = makeLooper();
    looper.setBpm(120);

    looper.toggle(); // idle -> armed
    expect(looper.view().mode).toBe('armed');

    // blocks BEFORE the first key must NOT be captured (no leading silence)
    pump(ctx, 0, 4);

    looper.noteStarted(); // first key -> rec
    expect(looper.view().mode).toBe('rec');
    pump(ctx, 0.5, 20); // ~20 blocks of audio

    looper.toggle(); // rec -> play (finalize master)
    const v = looper.view();
    expect(v.mode).toBe('play');
    expect(v.trackCount).toBe(1);

    // exactly one looping source, playing a frozen 2-channel buffer through loopOut
    expect(ctx.sources).toHaveLength(1);
    const src = ctx.sources[0];
    expect(src.loop).toBe(true);
    expect(src.buffer).not.toBeNull();
    // the captured audio is the 0.5 constant we fed (frozen). data[0] being 0.5 (not
    // a leading zero) proves the pre-key blocks were excluded. (The tail past the
    // recorded length may be beat-snap padding, so we sample inside the take.)
    const data = src.buffer!.getChannelData(0);
    expect(data[0]).toBeCloseTo(0.5);
    expect(data[20000]).toBeCloseTo(0.5);
  });

  it('snaps the master to whole BARS - a small tail past the bar line rounds down', () => {
    const { looper, ctx } = makeLooper();
    looper.setBpm(120); // beat = 24000, bar = 96000 samples @ 48k
    looper.toggle();
    looper.noteStarted();
    // ~4 bars + a fraction of a beat over the line -> must snap back to 4 bars, not 5
    const target = 96000 * 4 + 5000;
    pump(ctx, 0.5, Math.ceil(target / ctx.lastScript!.bufferSize));
    looper.toggle();
    expect(looper.view().loopBars).toBe(4);
    expect(ctx.sources[0].buffer!.length).toBe(96000 * 4);
  });

  it('snaps a very short take up to a minimum of one bar', () => {
    const { looper, ctx } = makeLooper();
    looper.setBpm(120);
    looper.toggle();
    looper.noteStarted();
    pump(ctx, 0.5, 3); // a few blocks, well under a bar
    looper.toggle();
    expect(looper.view().loopBars).toBe(1);
    expect(ctx.sources[0].buffer!.length).toBe(96000);
  });

  it('overdubs a new layer without disturbing the frozen first track', () => {
    const { looper, ctx, loopOut } = makeLooper();
    looper.setBpm(120);
    looper.toggle();
    looper.noteStarted();
    pump(ctx, 0.5, 30);
    looper.toggle(); // play, track 1 recorded
    const track1Source = ctx.sources[0];
    const track1Data = track1Source.buffer!.getChannelData(0);
    const len = track1Source.buffer!.length;

    looper.toggle(); // play -> rec (overdub)
    expect(looper.view().mode).toBe('rec');
    expect(looper.view().recTrack).toBe(1);
    pump(ctx, 0.3, 30); // play a second layer
    looper.toggle(); // finalize overdub

    const v = looper.view();
    expect(v.mode).toBe('play');
    expect(v.trackCount).toBe(2);
    // track 1's source object + audio are untouched (frozen)
    expect(ctx.sources[0]).toBe(track1Source);
    expect(track1Data[0]).toBeCloseTo(0.5);
    // the overdub is its own looping source of the SAME loop length, on loopOut
    const odSource = ctx.sources[1];
    expect(odSource.loop).toBe(true);
    expect(odSource.buffer!.length).toBe(len);
    expect(odSource.connections).toContain(loopOut);
    // the overdub buffer actually holds the captured 0.3 layer somewhere
    const od = odSource.buffer!.getChannelData(0);
    expect(od.some((s) => Math.abs(s - 0.3) < 1e-4)).toBe(true);
  });

  it('clear() stops every loop source and returns to idle', () => {
    const { looper, ctx } = makeLooper();
    looper.toggle();
    looper.noteStarted();
    pump(ctx, 0.5, 20);
    looper.toggle();
    expect(ctx.sources).toHaveLength(1);
    looper.clear();
    expect(looper.view().mode).toBe('idle');
    expect(looper.view().trackCount).toBe(0);
    expect(ctx.sources[0].stopped).toBe(true);
  });

  it('routes the metronome to loopOut only (never into the recorded live tap)', () => {
    vi.useFakeTimers();
    const { looper, ctx, live, loopOut } = makeLooper();
    looper.setBpm(120);
    looper.toggle(); // arm -> metronome scheduler starts
    ctx.currentTime = 1.0; // advance past a couple of beats
    vi.advanceTimersByTime(30); // fire the lookahead scheduler

    expect(ctx.oscillators.length).toBeGreaterThan(0); // clicks were scheduled
    const clickTargets = ctx.oscillators.flatMap((o) => o.connections); // osc -> gain
    const gains = clickTargets as FakeNode[];
    // every click gain feeds loopOut, and none of them feeds the recorded live bus
    expect(gains.every((g) => g.connections.includes(loopOut))).toBe(true);
    expect(live.connections.some((n) => gains.includes(n))).toBe(false);
    looper.clear();
  });

  it('does not record while only armed (no master block leaks in)', () => {
    const { looper, ctx } = makeLooper();
    looper.toggle(); // armed
    pump(ctx, 0.9, 10); // audio while armed
    looper.toggle(); // armed -> idle (cancelled, never pressed a key)
    expect(looper.view().mode).toBe('idle');
    expect(ctx.sources).toHaveLength(0); // nothing was recorded
  });
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useRealTimers();
});
