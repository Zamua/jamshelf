import { describe, it, expect } from 'vitest';
import { COUNT_IN_BEATS, MAX_LAYERS, initialLooper, nextLooper, type LooperEffect, type LooperEvent, type LooperState } from '../looperMachine';

function run(events: LooperEvent[], from: LooperState = initialLooper): { s: LooperState; fx: LooperEffect[] } {
  let s = from;
  const fx: LooperEffect[] = [];
  for (const e of events) {
    const t = nextLooper(s, e);
    s = t.state;
    fx.push(...t.effects);
  }
  return { s, fx };
}
const click: LooperEvent = { type: 'click' };
const downbeat: LooperEvent = { type: 'downbeat' };
// in looper mode with a master recorded and playing
const withMaster = run([click, click, downbeat, click]).s;

describe('HiClone looper machine', () => {
  it('the first click only enters looper mode', () => {
    const { s, fx } = run([click]);
    expect(s).toEqual({ ...initialLooper, active: true });
    expect(fx).toEqual([]);
  });

  it('records a master: count-in, capture from bar 1, then a playing layer', () => {
    const { s, fx } = run([click, click, { type: 'countBeat', beatsLeft: 2 }, downbeat, click]);
    expect(s.phase).toEqual({ kind: 'playing' });
    expect(s.layers).toBe(1);
    expect(fx).toEqual([{ kind: 'beginTake', track: 0 }, { kind: 'startCapture' }, { kind: 'finishTake', track: 0 }]);
  });

  it('counts down the count-in and ignores a beat outside one', () => {
    const counting = run([click, click, { type: 'countBeat', beatsLeft: 1 }]).s;
    expect(counting.phase).toEqual({ kind: 'countIn', track: 0, beatsLeft: 1 });
    expect(nextLooper(withMaster, { type: 'countBeat', beatsLeft: 3 }).state).toBe(withMaster);
  });

  it('a re-press during the count-in abandons the take and resumes', () => {
    const master = run([click, click, click]);
    expect(master.s.phase).toEqual({ kind: 'idle' });
    expect(master.fx.at(-1)).toEqual({ kind: 'cancelTake', resume: true });
    const overdub = run([click, click], withMaster);
    expect(overdub.s.phase).toEqual({ kind: 'playing' });
    expect(overdub.s.layers).toBe(1);
  });

  it('overdubs onto the next layer, up to the layer limit', () => {
    let s = withMaster;
    for (let i = 1; i < MAX_LAYERS; i++) s = run([click, downbeat, click], s).s;
    expect(s.layers).toBe(MAX_LAYERS);
    expect(nextLooper(s, click)).toEqual({ state: s, effects: [] });
  });

  it('joystick up keeps a recording take, drops one counting in, and halts', () => {
    const recording = run([click, downbeat, { type: 'exit' }], withMaster);
    expect(recording.s).toMatchObject({ phase: { kind: 'halted' }, active: false, layers: 2 });
    expect(recording.fx.slice(-2)).toEqual([{ kind: 'finishTake', track: 1 }, { kind: 'halt' }]);
    const counting = run([click, { type: 'exit' }], withMaster);
    expect(counting.s).toMatchObject({ phase: { kind: 'halted' }, active: false, layers: 1 });
    expect(counting.fx.at(-1)).toEqual({ kind: 'cancelTake', resume: false });
  });

  it('a stray downbeat after a cancelled count-in starts nothing', () => {
    const cancelled = run([click, click], withMaster).s;
    expect(nextLooper(cancelled, downbeat).state).toBe(cancelled);
  });

  it('solo stop halts and restarts the layers from bar 1; nothing to stop mid-capture', () => {
    const halted = run([{ type: 'toggleStop' }], withMaster);
    expect(halted.s.phase).toEqual({ kind: 'halted' });
    const again = run([{ type: 'toggleStop' }], halted.s);
    expect(again.fx).toEqual([{ kind: 'play', beat: 0 }]);
    const capturing = run([click, downbeat], withMaster).s;
    expect(nextLooper(capturing, { type: 'toggleStop' }).state).toBe(capturing);
  });

  it('rides the rig transport only while a loop is recorded and no take runs', () => {
    const paused = run([{ type: 'follow', playing: false, beat: 3 }], withMaster);
    expect(paused.s.phase).toEqual({ kind: 'halted' });
    expect(run([{ type: 'follow', playing: true, beat: 3 }], paused.s).fx).toEqual([{ kind: 'play', beat: 3 }]);
    const counting = run([click], withMaster).s;
    expect(nextLooper(counting, { type: 'follow', playing: false, beat: 0 }).state).toBe(counting);
    expect(nextLooper(run([click]).s, { type: 'follow', playing: true, beat: 0 }).effects).toEqual([]);
  });

  it('clear drops the selected overdub, but wipes everything from the master', () => {
    const two = run([click, downbeat, click], withMaster).s;
    expect(two.selected).toBe(1);
    const dropped = run([{ type: 'clear' }], two);
    expect(dropped.fx).toEqual([{ kind: 'dropLayer', index: 1 }]);
    expect(dropped.s).toMatchObject({ layers: 1, selected: 0 });
    const wiped = run([{ type: 'clear' }], dropped.s);
    expect(wiped.s).toEqual({ ...initialLooper, active: true });
    expect(wiped.fx).toEqual([{ kind: 'wipe', resumeRig: false }]);
  });

  it('clearing during a count-in resumes the rig it suspended', () => {
    expect(run([click, click, { type: 'clear' }]).fx.at(-1)).toEqual({ kind: 'wipe', resumeRig: true });
  });

  it('clear does nothing outside looper mode', () => {
    const outside = run([{ type: 'exit' }], withMaster).s;
    expect(nextLooper(outside, { type: 'clear' }).state).toBe(outside);
  });

  it('saved loops come back halted, unless a take already began', () => {
    const restored = run([{ type: 'restored', layers: 3 }]);
    expect(restored.s).toMatchObject({ phase: { kind: 'halted' }, layers: 3, selected: 2 });
    const busy = run([click, click]).s;
    expect(nextLooper(busy, { type: 'restored', layers: 3 }).state).toBe(busy);
  });

  it('the count-in is a bar long', () => {
    expect(run([click, click]).s.phase).toEqual({ kind: 'countIn', track: 0, beatsLeft: COUNT_IN_BEATS });
  });
});
