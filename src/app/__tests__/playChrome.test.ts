import { describe, it, expect } from 'vitest';
import { awayChrome, landedChrome, nextPlayChrome, playable, type PlayChrome, type PlayChromeEvent } from '../playChrome';

const run = (events: PlayChromeEvent['type'][], from: PlayChrome = awayChrome) =>
  events.reduce((c, type) => nextPlayChrome(c, { type } as PlayChromeEvent), from);

describe('play chrome', () => {
  it('a device plays only once it has landed, and not while inspected', () => {
    expect(playable(awayChrome)).toBe(false);
    expect(playable(run(['land']))).toBe(true);
    expect(playable(run(['land', 'toggleInspect']))).toBe(false);
    expect(playable(run(['land', 'toggleInspect', 'toggleInspect']))).toBe(true);
  });

  it('leaving the device closes inspect and the manual, so the next one arrives unlanded', () => {
    const busy = run(['land', 'toggleInspect', 'toggleManual']);
    expect(run(['leave'], busy)).toEqual(awayChrome);
  });

  it('the manual toggles, and closing a closed one changes nothing', () => {
    expect(run(['toggleManual'], landedChrome).manual).toBe(true);
    expect(nextPlayChrome(landedChrome, { type: 'closeManual' })).toBe(landedChrome);
  });
});
