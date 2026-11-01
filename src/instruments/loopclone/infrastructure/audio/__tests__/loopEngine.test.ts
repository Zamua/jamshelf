import { describe, it, expect } from 'vitest';
import { LoopEngine } from '../loopEngine';
import type { Transport } from '../../../../../transport/transport';

// A fake AudioContext + transport: enough to drive the control logic and the capture lifecycle
// (audio blocks are fed by hand through the tap's onaudioprocess).
class FakeParam {
  value = 0;
  setTargetAtTime(v: number) {
    this.value = v;
  }
}
class FakeGain {
  gain = new FakeParam();
  connect() {}
  disconnect() {}
}
class FakeBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly chans: Float32Array[];
  constructor(ch: number, len: number, rate: number) {
    this.numberOfChannels = ch;
    this.length = len;
    this.sampleRate = rate;
    this.chans = Array.from({ length: ch }, () => new Float32Array(len));
  }
  getChannelData(i: number) {
    return this.chans[i];
  }
}
type Tap = { onaudioprocess: ((e: unknown) => void) | null };
class FakeCtx {
  sampleRate = 48000;
  currentTime = 0;
  baseLatency = 0;
  destination = {};
  tap: Tap | null = null;
  createGain() {
    return new FakeGain();
  }
  createScriptProcessor() {
    const tap = { connect() {}, disconnect() {}, onaudioprocess: null };
    this.tap = tap;
    return tap;
  }
  createBuffer(ch: number, len: number, rate: number) {
    return new FakeBuffer(ch, len, rate);
  }
  createBufferSource() {
    return { buffer: null, loop: false, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} };
  }
  // one block of input audio through the tap
  feed(samples: number) {
    const block = new Float32Array(samples).fill(0.1);
    this.tap?.onaudioprocess?.({ inputBuffer: { length: samples, getChannelData: () => block } });
  }
}
// A transport the test steers: running or not, and its position subscribers.
class FakeTransport {
  advancing = false;
  pulse = 0;
  private subs = new Set<() => void>();
  onPosition(cb: () => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  isAdvancing() {
    return this.advancing;
  }
  getBpm() {
    return 120;
  }
  position() {
    return { pulse: Math.max(0, this.pulse) };
  }
  // the real Transport.stop(): halt, rewind to -1, tell the position subscribers
  stop() {
    this.advancing = false;
    this.pulse = -1;
    for (const cb of this.subs) cb();
  }
}

function rig() {
  const ctx = new FakeCtx();
  const transport = new FakeTransport();
  const node = new FakeGain() as unknown as AudioNode;
  const e = new LoopEngine(ctx as unknown as AudioContext, node, node, transport as unknown as Transport);
  return { e, ctx, transport };
}
const engine = () => rig().e;
const BAR = 96000; // one 4/4 bar at 120 bpm and 48 kHz

describe('LoopEngine control logic', () => {
  it('setLevel updates + clamps the track level', () => {
    const e = engine();
    e.setLevel(0, 0.5);
    expect(e.view()[0].level).toBe(0.5);
    e.setLevel(0, 2);
    expect(e.view()[0].level).toBe(1);
    e.setLevel(0, -1);
    expect(e.view()[0].level).toBe(0);
  });

  it('stop() toggles mute (phase-preserving), leaving other tracks alone', () => {
    const e = engine();
    e.stop(1);
    expect(e.view()[1].muted).toBe(true);
    expect(e.view()[0].muted).toBe(false);
    e.stop(1);
    expect(e.view()[1].muted).toBe(false);
  });

  it('solo toggles the solo set', () => {
    const e = engine();
    e.solo(2);
    expect(e.view()[2].soloed).toBe(true);
    expect(e.view().filter((t) => t.soloed)).toHaveLength(1);
    e.solo(2);
    expect(e.view()[2].soloed).toBe(false);
  });

  it('starts with five empty tracks at the default level', () => {
    const e = engine();
    const v = e.view();
    expect(v).toHaveLength(5);
    expect(v.every((t) => t.state === 'empty' && !t.muted && !t.soloed)).toBe(true);
    expect(v[0].level).toBe(0.8);
  });
});

describe('LoopEngine capture lifecycle', () => {
  it('a second record closes the take in flight instead of stranding it', () => {
    const { e, ctx } = rig();
    e.button(0);
    ctx.feed(BAR);
    e.button(1);
    expect(e.view()[0].state).toBe('playing');
    expect(e.view()[1].state).toBe('recording');
  });

  it('clearing a capturing track stops the capture: it stays empty after a full loop of audio', () => {
    const { e, ctx } = rig();
    e.button(0);
    ctx.feed(BAR);
    e.button(0); // the first loop sets the length
    e.button(1);
    e.clear(1);
    ctx.feed(BAR * 2);
    expect(e.view()[1].state).toBe('empty');
  });

  it('a STOP keeps an armed take armed instead of starting it on the halted clock', () => {
    const { e, ctx, transport } = rig();
    transport.advancing = true;
    transport.pulse = 50; // mid-bar
    e.button(0);
    transport.stop();
    ctx.feed(BAR);
    e.button(0); // still armed, so this cancels it
    expect(e.view()[0].state).toBe('empty');
  });
});

