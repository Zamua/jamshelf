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

// Record the master: arm, first key (anchor), play `playBlocks`, mark the last note,
// then optionally let a `tailBlocks` release/reverb tail ring, then stop.
function recordMaster(
  looper: WebAudioLooper,
  ctx: FakeCtx,
  opts: { value?: number; playBlocks: number; tailBlocks?: number },
): void {
  const value = opts.value ?? 0.5;
  looper.toggle(); // arm
  looper.noteStarted(); // first key -> rec, anchor here
  pump(ctx, value, opts.playBlocks); // the playing
  looper.noteEnded(); // last note lifts -> sets the loop length reference
  if (opts.tailBlocks) pump(ctx, value * 0.6, opts.tailBlocks); // the ringing tail
  looper.toggle(); // finalize
}

// Advance past an overdub's 4-beat count-in so capturing has begun.
function passCountIn(ctx: FakeCtx): void {
  ctx.currentTime += 2.3; // 4 beats @ 120bpm + lead, on the audio clock
  vi.advanceTimersByTime(2300); // fire the scheduled "begin capture" step
}

// Record an overdub: start (count-in), wait it out, play, stop.
function recordOverdub(looper: WebAudioLooper, ctx: FakeCtx, value: number, blocks: number): void {
  looper.toggle(); // play -> rec (count-in begins)
  passCountIn(ctx);
  pump(ctx, value, blocks);
  looper.toggle(); // finalize overdub
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
    pump(ctx, 0.5, 40); // under a bar, so no tail wraps onto the start
    looper.noteEnded();

    looper.toggle(); // rec -> play (finalize master)
    const v = looper.view();
    expect(v.mode).toBe('play');
    expect(v.trackCount).toBe(1);

    // one looping source, playing a frozen 2-channel buffer; data[0] being 0.5 (not a
    // leading zero) proves the pre-key blocks were excluded.
    expect(ctx.sources).toHaveLength(1);
    const src = ctx.sources[0];
    expect(src.loop).toBe(true);
    expect(src.buffer!.getChannelData(0)[0]).toBeCloseTo(0.5);
  });

  it('quantizes the loop on the NOTES, so a long tail does not add a bar', () => {
    const { looper, ctx } = makeLooper();
    looper.setBpm(120); // bar = 96000 samples @ 48k
    const twoBars = Math.ceil((96000 * 2) / 2048);
    const longTail = Math.ceil((96000 * 1.4) / 2048); // ~1.4 bars of ringing tail
    recordMaster(looper, ctx, { playBlocks: twoBars, tailBlocks: longTail });
    // length follows the 2 bars you played, NOT the ~3.4 bars of audio captured
    expect(looper.view().loopBars).toBe(2);
    expect(ctx.sources[0].buffer!.length).toBe(96000 * 2);
  });

  it('snaps a very short take up to a minimum of one bar', () => {
    const { looper, ctx } = makeLooper();
    looper.setBpm(120);
    recordMaster(looper, ctx, { playBlocks: 3 }); // a few blocks, well under a bar
    expect(looper.view().loopBars).toBe(1);
    expect(ctx.sources[0].buffer!.length).toBe(96000);
  });

  it('overdubs with a count-in, keeping the master audio frozen', () => {
    const { looper, ctx, loopOut } = makeLooper();
    looper.setBpm(120);
    recordMaster(looper, ctx, { playBlocks: 40 }); // 1-bar master (no tail wrap)
    const masterBuf = ctx.sources[0].buffer!;
    const masterStart = masterBuf.getChannelData(0)[0];
    expect(masterStart).toBeCloseTo(0.5);

    looper.toggle(); // play -> rec: the count-in begins
    expect(looper.view().mode).toBe('rec');
    expect(looper.view().recTrack).toBe(1);
    expect(looper.view().countdown).toBe(4); // 4-beat count-in

    passCountIn(ctx);
    expect(looper.view().countdown).toBe(0); // count-in done, capturing now
    pump(ctx, 0.3, 50); // play the new layer
    looper.toggle(); // finalize overdub

    const v = looper.view();
    expect(v.mode).toBe('play');
    expect(v.trackCount).toBe(2);
    // the master's audio is the SAME buffer, unchanged (frozen) by the overdub
    expect(masterBuf.getChannelData(0)[0]).toBe(masterStart);
    // the overdub loops through loopOut (source -> gain -> loopOut) and holds the layer
    const od = ctx.sources[ctx.sources.length - 1];
    expect(od.loop).toBe(true);
    expect(od.connections[0].connections).toContain(loopOut);
    expect(od.buffer!.getChannelData(0).some((s) => Math.abs(s - 0.3) < 1e-4)).toBe(true);
  });

  it('selects layers; clears a non-master layer alone, the master wipes all', () => {
    const { looper, ctx } = makeLooper();
    looper.setBpm(120);
    recordMaster(looper, ctx, { playBlocks: 50 });
    recordOverdub(looper, ctx, 0.3, 50);
    recordOverdub(looper, ctx, 0.2, 50);
    expect(looper.view().trackCount).toBe(3);
    expect(looper.view().selected).toBe(2); // newest is selected

    // selection wraps over the three layers
    looper.selectTrack(1);
    expect(looper.view().selected).toBe(0);
    looper.selectTrack(-1);
    expect(looper.view().selected).toBe(2);

    // clear a non-master layer: it goes, the loop keeps playing with the rest
    looper.selectTrack(-1); // -> layer 1
    looper.clear();
    expect(looper.view().mode).toBe('play');
    expect(looper.view().trackCount).toBe(2);

    // clearing the master (layer 0) wipes everything
    while (looper.view().selected !== 0) looper.selectTrack(-1);
    looper.clear();
    expect(looper.view().mode).toBe('idle');
    expect(looper.view().trackCount).toBe(0);
  });

  it('joystick-down stops all layers and restarts them from the top', () => {
    const { looper, ctx } = makeLooper();
    looper.setBpm(120);
    recordMaster(looper, ctx, { playBlocks: 50 });
    const masterSrc = ctx.sources[0];
    expect(looper.view().stopped).toBe(false);

    looper.toggleStop(); // STOP
    expect(looper.view().stopped).toBe(true);
    expect(masterSrc.stopped).toBe(true);

    const before = ctx.sources.length;
    looper.toggleStop(); // restart from the top
    expect(looper.view().stopped).toBe(false);
    expect(ctx.sources.length).toBe(before + 1); // a fresh source for the restart
    expect(ctx.sources[ctx.sources.length - 1].loop).toBe(true);
  });

  it('clear() stops every loop source and returns to idle', () => {
    const { looper, ctx } = makeLooper();
    recordMaster(looper, ctx, { playBlocks: 20 });
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

// Fake timers throughout: the looper's metronome + display use setInterval, and the
// tests drive audio by hand (pumping blocks + advancing ctx.currentTime), so real
// timers would only leak. The metronome test advances them explicitly.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
