import { describe, it, expect } from 'vitest';
import { LoopEngine } from '../loopEngine';
import type { Transport } from '../../../../../transport/transport';

// The capture/playback path needs real-time audio (browser-verified separately). Here we pin the
// CONTROL logic - mute / solo / level / all-stop / the view - with a fake AudioContext + transport.
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
class FakeCtx {
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  createGain() {
    return new FakeGain();
  }
  createScriptProcessor() {
    return { connect() {}, disconnect() {}, onaudioprocess: null };
  }
}
const fakeTransport = () =>
  ({
    onPosition: () => () => {},
    isAdvancing: () => false,
    getBpm: () => 120,
    position: () => ({ pulse: 0 }),
  }) as unknown as Transport;

function engine() {
  const ctx = new FakeCtx() as unknown as AudioContext;
  const node = new FakeGain() as unknown as AudioNode;
  return new LoopEngine(ctx, node, node, fakeTransport(), () => {});
}

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
