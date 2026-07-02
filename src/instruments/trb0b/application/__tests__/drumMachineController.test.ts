import { describe, it, expect, beforeEach } from 'vitest';
import { DrumMachineController } from '../drumMachineController';
import type { Clock, DrumMachinePort, DrumSettings, SettingsStore } from '../ports';
import type { DrumVoice } from '../../domain/sequencer';

class SpySynth implements DrumMachinePort {
  hits: DrumVoice[] = [];
  muted = false;
  volume = 1;
  levels: Partial<Record<DrumVoice, number>> = {};
  resume() {}
  trigger(v: DrumVoice) { this.hits.push(v); }
  setVolume(v: number) { this.volume = v; }
  setLevel(v: DrumVoice, l: number) { this.levels[v] = l; }
  setMuted(m: boolean) { this.muted = m; }
}

// A fake clock the test drives by hand: call tick() to fire one step.
class FakeClock implements Clock {
  bpm = 0;
  beats = 0;
  running = false;
  private cb: (() => void) | null = null;
  setBpm(b: number) { this.bpm = b; }
  setBeatsPerTick(b: number) { this.beats = b; }
  start() { this.running = true; }
  stop() { this.running = false; }
  onTick(cb: () => void) { this.cb = cb; return () => { this.cb = null; }; }
  tick() { this.cb?.(); }
}

class MemoryStore implements SettingsStore {
  saved: DrumSettings | null = null;
  load() { return this.saved; }
  save(s: DrumSettings) { this.saved = s; }
}

describe('DrumMachineController', () => {
  let synth: SpySynth;
  let clock: FakeClock;
  let store: MemoryStore;
  let c: DrumMachineController;

  beforeEach(() => {
    synth = new SpySynth();
    clock = new FakeClock();
    store = new MemoryStore();
    c = new DrumMachineController(synth, clock, store);
  });

  it('sets a 16th-note subdivision on construct', () => {
    expect(clock.beats).toBe(0.25);
  });

  it('toggles a step of the selected voice', () => {
    c.toggleStep(0);
    expect(c.getState().pattern.BD[0]).toBe(true);
    c.selectVoice('SD');
    c.toggleStep(4);
    expect(c.getState().pattern.SD[4]).toBe(true);
    expect(c.getState().pattern.BD[4]).toBe(false);
  });

  it('play advances the playhead and triggers active voices per step', () => {
    c.toggleStep(0); // BD on step 0
    c.selectVoice('CH');
    c.toggleStep(0); // CH on step 0 too
    c.toggleStep(2); // CH on step 2
    c.togglePlay();
    expect(c.getState().playing).toBe(true);
    clock.tick(); // step 0 -> BD + CH
    expect(c.getState().currentStep).toBe(0);
    expect(synth.hits.sort()).toEqual(['BD', 'CH']);
    synth.hits = [];
    clock.tick(); // step 1 -> nothing
    expect(c.getState().currentStep).toBe(1);
    expect(synth.hits).toEqual([]);
    clock.tick(); // step 2 -> CH
    expect(synth.hits).toEqual(['CH']);
  });

  it('wraps the playhead after 16 steps', () => {
    c.togglePlay();
    for (let i = 0; i < 16; i++) clock.tick();
    expect(c.getState().currentStep).toBe(15);
    clock.tick();
    expect(c.getState().currentStep).toBe(0);
  });

  it('stop halts the clock and resets the playhead readout', () => {
    c.togglePlay();
    clock.tick();
    c.togglePlay(); // stop
    expect(c.getState().playing).toBe(false);
    expect(c.getState().currentStep).toBe(-1);
    expect(clock.running).toBe(false);
  });

  it('power off stops playback, mutes, and blocks edits', () => {
    c.toggleStep(0);
    c.togglePlay();
    c.togglePower(); // off
    expect(c.getState().power).toBe(false);
    expect(c.getState().playing).toBe(false);
    expect(synth.muted).toBe(true);
    c.toggleStep(4); // ignored while off
    expect(c.getState().pattern.BD[4]).toBe(false);
  });

  it('sets and persists per-voice levels, pushing them to the synth', () => {
    c.setLevel('SD', 0.4);
    expect(c.getState().levels.SD).toBe(0.4);
    expect(synth.levels.SD).toBe(0.4);
    c.setLevel('BD', 5); // clamps
    expect(c.getState().levels.BD).toBe(1);
    // restore into a fresh controller + synth
    const synth2 = new SpySynth();
    const c2 = new DrumMachineController(synth2, new FakeClock(), store);
    expect(c2.getState().levels.SD).toBe(0.4);
    expect(synth2.levels.SD).toBe(0.4); // applied on construct
  });

  it('clamps bpm and volume', () => {
    c.setBpm(9999);
    expect(c.getState().bpm).toBe(240);
    c.setBpm(1);
    expect(c.getState().bpm).toBe(40);
    expect(clock.bpm).toBe(40);
    c.setVolume(2);
    expect(c.getState().volume).toBe(1);
  });

  it('persists the pattern/bpm/volume/voice and restores them', () => {
    c.toggleStep(3);
    c.setBpm(140);
    c.setVolume(0.5);
    c.selectVoice('SD');
    expect(store.saved?.bpm).toBe(140);
    expect(store.saved?.pattern.BD[3]).toBe(true);
    const c2 = new DrumMachineController(new SpySynth(), new FakeClock(), store);
    expect(c2.getState()).toMatchObject({ bpm: 140, volume: 0.5, selected: 'SD' });
    expect(c2.getState().pattern.BD[3]).toBe(true);
  });

  it('does not write to storage on a transport tick (pattern unchanged)', () => {
    c.toggleStep(0);
    store.saved = null; // clear
    c.togglePlay();
    clock.tick();
    clock.tick();
    expect(store.saved).toBeNull(); // ticks moved the playhead but saved nothing
  });
});
