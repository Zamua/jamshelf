import { describe, it, expect, beforeEach } from 'vitest';
import { Transport, PPQN } from '../transport';

// Drive the pure transport by hand: play() then advance() N pulses. `pulse` is a 0-based INDEX:
// the first advance lands on pulse 0 (the downbeat), so N advances reach index N-1.
function run(t: Transport, pulses: number) {
  for (let i = 0; i < pulses; i++) t.advance();
}

describe('Transport (the master clock)', () => {
  let t: Transport;
  beforeEach(() => {
    t = new Transport();
  });

  it('does not advance while stopped (reports the downbeat)', () => {
    run(t, 10);
    expect(t.position().pulse).toBe(0);
  });

  it('advances one pulse per advance() while running; play/stop/toggle gate it, resume continues', () => {
    t.play();
    t.advance(); // first pulse -> index 0 (the downbeat)
    expect(t.position().pulse).toBe(0);
    run(t, 23); // 23 more -> index 23
    expect(t.position().pulse).toBe(23);
    t.stop();
    run(t, 5); // ignored while stopped
    expect(t.position().pulse).toBe(23);
    t.toggle(); // -> play, RESUMES from where it paused (does not reset)
    t.advance(); // -> index 24
    expect(t.position()).toMatchObject({ pulse: 24, beat: 2 });
  });

  it('derives bar / beat / tick / phase from the pulse index', () => {
    t.play();
    expect(t.position()).toMatchObject({ bar: 1, beat: 1, tick: 0, phase: 0 });
    run(t, PPQN + 1); // reach index 24 = one quarter note in -> beat 2 downbeat
    expect(t.position()).toMatchObject({ pulse: PPQN, bar: 1, beat: 2, tick: 0 });
    run(t, PPQN * 3); // +3 beats -> index 96 = bar 2 downbeat
    expect(t.position()).toMatchObject({ bar: 2, beat: 1, tick: 0, phase: 0 });
  });

  it('clamps bpm and computes the pulse interval', () => {
    t.setBpm(9999);
    expect(t.getBpm()).toBe(300);
    t.setBpm(1);
    expect(t.getBpm()).toBe(20);
    t.setBpm(120);
    expect(t.intervalMs()).toBeCloseTo(60000 / 120 / PPQN, 6); // ~20.83ms
  });

  it('a sub-clock fires on its subdivision grid, only while started, with an absolute tick index', () => {
    t.play();
    const c = t.clock();
    c.setBeatsPerTick(0.25); // a 16th = 6 pulses
    const ticks: number[] = [];
    c.onTick((n) => ticks.push(n));
    run(t, 6); // indices 0..5, not started yet -> nothing
    expect(ticks).toEqual([]);
    c.start();
    run(t, 18); // indices 6..23; aligned indices 6,12,18 -> ticks 1,2,3
    expect(ticks).toEqual([1, 2, 3]);
    c.stop();
    run(t, 12);
    expect(ticks).toEqual([1, 2, 3]); // stopped -> no more
  });

  it('two sub-clocks stay phase-locked (same grid, one shared counter)', () => {
    t.play();
    const a = t.clock();
    const b = t.clock();
    a.setBeatsPerTick(0.25); // 16th (6 pulses)
    b.setBeatsPerTick(0.5); // 8th (12 pulses)
    const aT: number[] = [];
    const bT: number[] = [];
    a.onTick((n) => aT.push(n));
    b.onTick((n) => bT.push(n));
    a.start();
    b.start();
    run(t, PPQN + 1); // indices 0..24
    expect(aT).toEqual([0, 1, 2, 3, 4]); // 16ths at indices 0,6,12,18,24
    expect(bT).toEqual([0, 1, 2]); // 8ths at indices 0,12,24 - every other 16th
  });

  it('sub-clock setBpm routes to the transport (one tempo owner)', () => {
    const c = t.clock();
    c.setBpm(140);
    expect(t.getBpm()).toBe(140);
  });

  it('free-run advances the pulse while stopped; FREE clocks fire, GATED (sequencer) clocks do not', () => {
    const gated = t.clock(true); // a sequencer
    const free = t.clock(false); // a live arp
    gated.setBeatsPerTick(0.25);
    free.setBeatsPerTick(0.25);
    const g: number[] = [];
    const f: number[] = [];
    gated.onTick((n) => g.push(n));
    free.onTick((n) => f.push(n));
    gated.start();
    free.start();
    t.setFreeRun(true); // stopped, but advancing
    expect(t.isRunning()).toBe(false);
    expect(t.isAdvancing()).toBe(true);
    run(t, 13); // indices 0..12; aligned 0,6,12
    expect(f).toEqual([0, 1, 2]); // the arp runs in free-run
    expect(g).toEqual([]); // the sequencer stays silent (not playing)
    t.play(); // now explicitly playing -> the gated clock joins
    run(t, 6); // indices 13..18; aligned 18 -> tick 3
    expect(g).toEqual([3]);
    expect(f).toEqual([0, 1, 2, 3]); // both fire once playing
  });

  it('onChange fires on structural changes only; onPosition fires per pulse', () => {
    let changes = 0;
    let positions = 0;
    t.onChange(() => changes++);
    t.onPosition(() => positions++);
    t.play(); // structural
    run(t, 5);
    expect(changes).toBe(1); // only play (advance does not fire onChange)
    expect(positions).toBe(5);
    t.setBpm(130); // structural
    expect(changes).toBe(2);
  });
});
