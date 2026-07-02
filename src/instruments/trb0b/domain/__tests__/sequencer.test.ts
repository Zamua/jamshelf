import { describe, it, expect } from 'vitest';
import {
  VOICES,
  STEPS,
  emptyPattern,
  toggleStep,
  clearVoice,
  nextStep,
  voicesAtStep,
  isEmpty,
} from '../sequencer';

describe('TR-B0B sequencer domain', () => {
  it('has 8 voices and 16 steps', () => {
    expect(VOICES).toHaveLength(8);
    expect(STEPS).toBe(16);
  });

  it('starts empty (every voice, every step off)', () => {
    const p = emptyPattern();
    expect(isEmpty(p)).toBe(true);
    for (const v of VOICES) expect(p[v]).toHaveLength(16);
  });

  it('toggles a step immutably', () => {
    const p0 = emptyPattern();
    const p1 = toggleStep(p0, 'BD', 0);
    expect(p1.BD[0]).toBe(true);
    expect(p0.BD[0]).toBe(false); // original unchanged
    const p2 = toggleStep(p1, 'BD', 0);
    expect(p2.BD[0]).toBe(false);
  });

  it('ignores out-of-range steps', () => {
    const p = toggleStep(emptyPattern(), 'SD', 99);
    expect(isEmpty(p)).toBe(true);
  });

  it('reports the voices active on a step', () => {
    let p = emptyPattern();
    p = toggleStep(p, 'BD', 4);
    p = toggleStep(p, 'CH', 4);
    p = toggleStep(p, 'SD', 8);
    expect(voicesAtStep(p, 4).sort()).toEqual(['BD', 'CH']);
    expect(voicesAtStep(p, 8)).toEqual(['SD']);
    expect(voicesAtStep(p, 0)).toEqual([]);
  });

  it('clears one voice or the whole pattern', () => {
    let p = toggleStep(toggleStep(emptyPattern(), 'BD', 0), 'SD', 2);
    p = clearVoice(p, 'BD');
    expect(p.BD.every((s) => !s)).toBe(true);
    expect(p.SD[2]).toBe(true); // other voice kept
    p = clearVoice(p);
    expect(isEmpty(p)).toBe(true);
  });

  it('wraps the step counter at 16', () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(15)).toBe(0);
  });
});
