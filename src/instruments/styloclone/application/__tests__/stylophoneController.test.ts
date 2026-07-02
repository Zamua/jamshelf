import { describe, it, expect, beforeEach } from 'vitest';
import { StylophoneController } from '../stylophoneController';
import type { StylophonePort, SettingsStore, StylophoneSettings, VoiceName } from '../ports';
import type { Midi } from '../../domain/keyboard';

// A spy synth that records the calls the controller makes to the port.
class SpySynth implements StylophonePort {
  calls: string[] = [];
  lastNote: Midi | null = null;
  muted = false;
  voice: VoiceName = 'BUZZ';
  vibrato = false;
  tune = 0;
  volume = 1;
  resume() { this.calls.push('resume'); }
  noteOn(midi: Midi) { this.calls.push('noteOn:' + midi); this.lastNote = midi; }
  noteOff() { this.calls.push('noteOff'); this.lastNote = null; }
  setVibrato(on: boolean) { this.vibrato = on; }
  setTune(cents: number) { this.tune = cents; }
  setVolume(v: number) { this.volume = v; }
  setVoice(name: VoiceName) { this.voice = name; }
  setMuted(muted: boolean) { this.muted = muted; }
}

class MemoryStore implements SettingsStore {
  saved: StylophoneSettings | null = null;
  load() { return this.saved; }
  save(s: StylophoneSettings) { this.saved = s; }
}

describe('StylophoneController', () => {
  let synth: SpySynth;
  let store: MemoryStore;
  let c: StylophoneController;

  beforeEach(() => {
    synth = new SpySynth();
    store = new MemoryStore();
    c = new StylophoneController(synth, store);
  });

  it('presses a key -> noteOn + lit', () => {
    c.pressKey(48); // C3
    expect(synth.lastNote).toBe(48);
    expect(c.getState().litKey).toBe(48);
    expect(c.getState().noteLabel).toBe('C3');
  });

  it('is monophonic: a new key retriggers the single voice', () => {
    c.pressKey(48);
    c.pressKey(50);
    expect(synth.calls.filter((x) => x.startsWith('noteOn'))).toEqual(['noteOn:48', 'noteOn:50']);
    expect(c.getState().litKey).toBe(50);
  });

  it('ignores the same key repeated (drag jitter) without a re-attack', () => {
    c.pressKey(48);
    c.pressKey(48);
    expect(synth.calls.filter((x) => x.startsWith('noteOn'))).toEqual(['noteOn:48']);
  });

  it('ignores keys outside the 20-key range', () => {
    c.pressKey(30); // way below A2
    expect(c.getState().litKey).toBeNull();
    expect(synth.lastNote).toBeNull();
  });

  it('releases the voice on releaseKey', () => {
    c.pressKey(48);
    c.releaseKey();
    expect(c.getState().litKey).toBeNull();
    expect(synth.calls).toContain('noteOff');
  });

  it('powering off releases the note, mutes, and blocks new notes', () => {
    c.pressKey(48);
    c.togglePower(); // off
    expect(c.getState().power).toBe(false);
    expect(c.getState().litKey).toBeNull();
    expect(synth.muted).toBe(true);
    c.pressKey(50); // ignored while off
    expect(c.getState().litKey).toBeNull();
  });

  it('toggles vibrato and cycles the voice', () => {
    c.toggleVibrato();
    expect(c.getState().vibrato).toBe(true);
    expect(synth.vibrato).toBe(true);
    c.nextVoice();
    expect(c.getState().voice).toBe('ROUND');
    c.nextVoice();
    c.nextVoice(); // wraps back to BUZZ
    expect(c.getState().voice).toBe('BUZZ');
  });

  it('clamps tune and volume to range', () => {
    c.setTune(999);
    expect(c.getState().tune).toBe(100);
    c.setTune(-999);
    expect(c.getState().tune).toBe(-100);
    c.setVolume(2);
    expect(c.getState().volume).toBe(1);
    c.setVolume(-1);
    expect(c.getState().volume).toBe(0);
  });

  it('persists durable settings and restores them', () => {
    c.toggleVibrato();
    c.nextVoice();
    c.setTune(40);
    c.setVolume(0.5);
    expect(store.saved).toEqual({ voice: 'ROUND', vibrato: true, tune: 40, volume: 0.5 });
    // a fresh controller over the same store restores the settings (side effects applied)
    const synth2 = new SpySynth();
    const c2 = new StylophoneController(synth2, store);
    expect(c2.getState()).toMatchObject({ voice: 'ROUND', vibrato: true, tune: 40, volume: 0.5 });
    expect(synth2.voice).toBe('ROUND');
    expect(synth2.vibrato).toBe(true);
    expect(synth2.tune).toBe(40);
    expect(synth2.volume).toBe(0.5);
  });

  it('does not persist transient state (held key / power / inspect)', () => {
    c.pressKey(48);
    c.setInspect(true);
    // saved settings carry only the musical prefs, not litKey/power/inspect
    expect(store.saved).toBeNull(); // nothing durable changed yet
    c.setVolume(0.3);
    expect(store.saved).toEqual({ voice: 'BUZZ', vibrato: false, tune: 0, volume: 0.3 });
  });
});
