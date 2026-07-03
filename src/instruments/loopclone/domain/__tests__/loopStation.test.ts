import { describe, it, expect } from 'vitest';
import { nextOnButton, onStop, hasContent, isLive, emptyTrack, TRACK_COUNT } from '../loopStation';

describe('loop station track state machine', () => {
  it('cycles empty -> recording -> playing -> overdub -> playing on the button', () => {
    let s = emptyTrack().state;
    s = nextOnButton(s);
    expect(s).toBe('recording');
    s = nextOnButton(s);
    expect(s).toBe('playing');
    s = nextOnButton(s);
    expect(s).toBe('overdub');
    s = nextOnButton(s);
    expect(s).toBe('playing');
  });

  it('a stopped track resumes to playing on the button', () => {
    expect(nextOnButton('stopped')).toBe('playing');
  });

  it('stop halts a live track but leaves an empty one empty', () => {
    expect(onStop('playing')).toBe('stopped');
    expect(onStop('recording')).toBe('stopped');
    expect(onStop('overdub')).toBe('stopped');
    expect(onStop('empty')).toBe('empty');
  });

  it('hasContent / isLive classify the states', () => {
    expect(hasContent('empty')).toBe(false);
    expect(hasContent('stopped')).toBe(true);
    expect(hasContent('playing')).toBe(true);
    expect(isLive('playing')).toBe(true);
    expect(isLive('overdub')).toBe(true);
    expect(isLive('recording')).toBe(false);
    expect(isLive('stopped')).toBe(false);
  });

  it('has 5 tracks', () => {
    expect(TRACK_COUNT).toBe(5);
  });
});
