import { describe, it, expect, vi, afterEach } from 'vitest';
import { Transport } from '../transport';
import { IntervalTicker } from '../intervalTicker';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('IntervalTicker (self-correcting to the wall clock)', () => {
  it('advances the transport to match elapsed time, catching up when a wake is delayed', () => {
    vi.useFakeTimers();
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    const t = new Transport(); // 120 bpm -> 60000/120/24 = 20.833ms per pulse
    new IntervalTicker(t);
    t.play(); // re-anchors at clock=1000

    // 100ms of real time pass but only ONE wake fires (setInterval throttled under load).
    clock = 1100;
    vi.advanceTimersByTime(12); // a single tick

    // floor(100 / 20.833) = 4 pulses SHOULD have elapsed - the ticker catches all 4 up in one wake
    // (a naive one-pulse-per-tick clock would have advanced only 1, i.e. run 4x slow).
    expect(t.position().pulse).toBe(3); // 0-based index after 4 advances (0,1,2,3)
  });

  it('re-anchors instead of batch-firing a huge backlog (backgrounded tab)', () => {
    vi.useFakeTimers();
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    const t = new Transport();
    new IntervalTicker(t);
    t.play();

    // jump 10 seconds (tab was backgrounded) - way more than a bar's worth of pulses
    clock = 11000;
    vi.advanceTimersByTime(12);

    // it must NOT fire ~480 pulses at once; it re-anchors, so the position barely moved
    expect(t.position().pulse).toBeLessThan(96); // fewer than one bar's pulses
  });

  it('stops advancing when the transport stops', () => {
    vi.useFakeTimers();
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    const t = new Transport();
    new IntervalTicker(t);
    t.play();
    clock = 1050;
    vi.advanceTimersByTime(12);
    const atStop = t.position().pulse;
    t.stop();
    clock = 2000; // lots more time passes while stopped
    vi.advanceTimersByTime(60);
    expect(t.position().pulse).toBe(atStop); // frozen
  });
});
