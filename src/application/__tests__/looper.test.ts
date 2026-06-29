import { describe, it, expect, beforeEach } from 'vitest';
import { Looper } from '../looper';
import { FakeTicker, SpySynth } from './fakes';

let synth: SpySynth;
let ticker: FakeTicker;
let loop: Looper;

beforeEach(() => {
  synth = new SpySynth();
  ticker = new FakeTicker();
  loop = new Looper(synth, ticker);
});

describe('looper state machine', () => {
  it('idle -> rec(master) -> play, with the master length defining the loop', () => {
    expect(loop.view().mode).toBe('idle');
    loop.toggle(0); // start recording the master
    expect(loop.view().mode).toBe('rec');
    expect(loop.view().recTrack).toBe(0);
    expect(ticker.running).toBe(true);
    loop.toggle(1000); // stop -> loop length = 1000ms, start playing
    expect(loop.view().mode).toBe('play');
    expect(loop.view().recTrack).toBe(-1);
    expect(loop.view().trackCount).toBe(0); // nothing was captured
  });

  it('records and plays back captured events on the loop', () => {
    loop.toggle(0); // rec master
    ticker.frame(250); // playhead -> 250
    loop.capture(true, 'p1', [440], 'SAW'); // a note at 250ms
    ticker.frame(500);
    loop.capture(false, 'p1', [], 'SAW'); // released at 500ms
    loop.toggle(1000); // stop -> 1000ms loop, play
    expect(loop.view().trackCount).toBe(1);

    // advance the playhead across the recorded events on the next loop pass
    synth.on = [];
    ticker.frame(1100); // pos 100
    ticker.frame(1300); // pos 300 -> crosses the note-on at 250
    expect(synth.on.map((o) => o.id)).toContain('loop:0:p1');
    expect(synth.lastOn().freqs).toEqual([440]);
    expect(synth.lastOn().patch).toBe('SAW'); // played back with its own instrument
    ticker.frame(1600); // pos 600 -> crosses the note-off at 500
    expect(synth.off).toContain('loop:0:p1');
  });

  it('overdubs a second track and plays both', () => {
    loop.toggle(0);
    loop.capture(true, 'a', [220], 'SAW');
    loop.toggle(1000); // master done (1s loop)
    // overdub
    loop.toggle(1000); // play -> rec track 1 (anchor stays, posMs from frames)
    expect(loop.view().mode).toBe('rec');
    expect(loop.view().recTrack).toBe(1);
    ticker.frame(1500); // pos 500
    loop.capture(true, 'b', [330], 'BELL');
    loop.toggle(2000); // stop overdub
    expect(loop.view().trackCount).toBe(2);
  });

  it("does not play back the track currently being recorded", () => {
    loop.toggle(0);
    loop.capture(true, 'a', [220], 'SAW');
    loop.toggle(1000); // master (1s)
    loop.toggle(1000); // start overdub on track 1
    synth.on = [];
    ticker.frame(1100);
    ticker.frame(1900); // a full pass; track 0's event should play, track 1 (rec) should not
    expect(synth.onIds().some((id) => id.startsWith('loop:0:'))).toBe(true);
    expect(synth.onIds().some((id) => id.startsWith('loop:1:'))).toBe(false);
  });

  it('clear() wipes everything and stops the ticker', () => {
    loop.toggle(0);
    loop.capture(true, 'a', [220], 'SAW');
    loop.toggle(1000);
    loop.clear();
    expect(loop.view().mode).toBe('idle');
    expect(loop.view().trackCount).toBe(0);
    expect(ticker.running).toBe(false);
  });
});
