import { describe, it, expect } from 'vitest';
import { emptyStation, next, trackState, type Station, type StationEffect, type StationEvent } from '../loopStation';

// Feed a sequence of events; return the final station and every effect, in order.
function run(events: StationEvent[], from: Station = emptyStation()): { s: Station; fx: StationEffect[] } {
  let s = from;
  const fx: StationEffect[] = [];
  for (const e of events) {
    const t = next(s, e);
    s = t.station;
    fx.push(...t.effects);
  }
  return { s, fx };
}
const press = (track: number, advancing = false): StationEvent => ({ type: 'button', track, advancing });
const states = (s: Station) => s.tracks.map((_, i) => trackState(s, i));

describe('LoopClone station', () => {
  it('record, close, overdub, close: one track through its cycle', () => {
    const { s, fx } = run([press(0), press(0), press(0), { type: 'loopFilled' }]);
    expect(states(s)[0]).toBe('playing');
    expect(fx.map((f) => f.kind)).toEqual(['startCapture', 'finishCapture', 'startCapture', 'finishCapture']);
    expect(fx[2]).toEqual({ kind: 'startCapture', track: 0, overdub: true });
  });

  it('a running transport arms the take until the next downbeat', () => {
    let r = run([press(1, true)]);
    expect(r.s.capture).toEqual({ kind: 'armed', track: 1, overdub: false });
    expect(states(r.s)[1]).toBe('recording');
    expect(r.fx).toEqual([]);
    r = run([{ type: 'downbeat' }], r.s);
    expect(r.s.capture).toEqual({ kind: 'capturing', track: 1, overdub: false });
    expect(r.fx).toEqual([{ kind: 'startCapture', track: 1, overdub: false }]);
  });

  it('pressing an armed track cancels the take', () => {
    const { s, fx } = run([press(1, true), press(1, true)]);
    expect(s).toEqual(emptyStation());
    expect(fx).toEqual([]);
  });

  it('one take at a time: another track closes the take in flight, then starts its own', () => {
    const { s, fx } = run([press(0), press(1)]);
    expect(states(s).slice(0, 2)).toEqual(['playing', 'recording']);
    expect(fx).toEqual([
      { kind: 'startCapture', track: 0, overdub: false },
      { kind: 'finishCapture', track: 0, overdub: false },
      { kind: 'startCapture', track: 1, overdub: false },
    ]);
  });

  it('another track drops an armed take instead of keeping it', () => {
    const { s } = run([press(0, true), press(1, true)]);
    expect(s.capture).toEqual({ kind: 'armed', track: 1, overdub: false });
    expect(states(s)[0]).toBe('empty');
  });

  it('clearing a capturing track discards the take; later audio cannot resurrect it', () => {
    const { s, fx } = run([press(0), press(0), press(1), { type: 'clear', track: 1 }, { type: 'loopFilled' }]);
    expect(states(s).slice(0, 2)).toEqual(['playing', 'empty']);
    expect(s.capture.kind).toBe('idle');
    expect(fx.slice(-2)).toEqual([{ kind: 'discardCapture' }, { kind: 'clear', track: 1 }]);
  });

  it('clearing another track leaves the take in flight alone', () => {
    const { s } = run([press(0), press(0), press(1), { type: 'clear', track: 0 }]);
    expect(s.capture).toEqual({ kind: 'capturing', track: 1, overdub: false });
  });

  it('a downbeat or a filled loop with no take does nothing', () => {
    const s = emptyStation();
    expect(next(s, { type: 'downbeat' }).station).toBe(s);
    expect(next(s, { type: 'loopFilled' }).station).toBe(s);
  });

  it('undo never rewrites a track mid-take, and needs history to act', () => {
    const mid = run([press(0)]).s;
    expect(next(mid, { type: 'history', track: 0, step: 'undo', result: 'empty' }).effects).toEqual([]);
    const done = run([press(0)], mid).s;
    expect(next(done, { type: 'history', track: 0, step: 'undo', result: 'none' }).effects).toEqual([]);
    const undone = next(done, { type: 'history', track: 0, step: 'undo', result: 'empty' });
    expect(states(undone.station)[0]).toBe('empty');
    expect(undone.effects).toEqual([{ kind: 'history', track: 0, step: 'undo' }]);
  });

  it('restored loops come back stopped and resume on a press, unless a take already began', () => {
    const r = run([{ type: 'restored', present: [true, false, true, false, false] }, press(2)]);
    expect(states(r.s)).toEqual(['stopped', 'empty', 'playing', 'empty', 'empty']);
    expect(r.fx).toEqual([{ kind: 'restore' }, { kind: 'resume', track: 2 }]);
    const busy = run([press(0)]).s;
    expect(next(busy, { type: 'restored', present: [true, true, true, true, true] }).station).toBe(busy);
  });
});
