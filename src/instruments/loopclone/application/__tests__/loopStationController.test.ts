import { describe, it, expect } from 'vitest';
import { Transport } from '../../../../transport/transport';
import { LoopStationController } from '../loopStationController';

// tapTempo is pure timing logic (no audio needed - the controller runs engine-less without SharedAudio).
describe('LoopStationController tapTempo', () => {
  it('sets BPM from the average tap interval', () => {
    const t = new Transport();
    const c = new LoopStationController(t);
    c.tapTempo(0);
    c.tapTempo(500);
    c.tapTempo(1000);
    c.tapTempo(1500); // 500ms apart = 120 BPM
    expect(t.getBpm()).toBe(120);
  });

  it('needs at least two taps before it changes tempo', () => {
    const t = new Transport();
    const before = t.getBpm();
    const c = new LoopStationController(t);
    c.tapTempo(0); // a single tap does nothing
    expect(t.getBpm()).toBe(before);
  });

  it('restarts the count after a long gap', () => {
    const t = new Transport();
    const c = new LoopStationController(t);
    c.tapTempo(0);
    c.tapTempo(500); // 120 BPM
    expect(t.getBpm()).toBe(120);
    c.tapTempo(9000); // > 2s gap: fresh count (single tap, no change)
    c.tapTempo(9400);
    c.tapTempo(9800); // 400ms apart = 150 BPM
    expect(t.getBpm()).toBe(150);
  });
});
