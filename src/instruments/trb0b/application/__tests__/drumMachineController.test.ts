import { describe, it, expect, beforeEach } from 'vitest';
import { DrumMachineController } from '../drumMachineController';
import type { DrumMachinePort, DrumSettings, SettingsStore } from '../ports';
import type { DrumVoice } from '../../domain/sequencer';
import { Transport } from '../../../../transport/transport';

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

class MemoryStore implements SettingsStore {
  saved: DrumSettings | null = null;
  load() { return this.saved; }
  save(s: DrumSettings) { this.saved = s; }
}

// The controller slaves to a real Transport. One step = a 16th = 6 pulses, and the sub-clock fires
// on the pulse-index grid (0,6,12,...), so advancing 6 pulses fires exactly one step (0,1,2,...).
function step(t: Transport) {
  for (let i = 0; i < 6; i++) t.advance();
}

describe('DrumMachineController (slaved to the shared Transport)', () => {
  let synth: SpySynth;
  let transport: Transport;
  let store: MemoryStore;
  let c: DrumMachineController;

  beforeEach(() => {
    synth = new SpySynth();
    transport = new Transport();
    store = new MemoryStore();
    c = new DrumMachineController(synth, transport, store);
  });

  it('toggles a step of the selected voice', () => {
    c.toggleStep(0);
    expect(c.getState().pattern.BD[0]).toBe(true);
    c.selectVoice('SD');
    c.toggleStep(4);
    expect(c.getState().pattern.SD[4]).toBe(true);
    expect(c.getState().pattern.BD[4]).toBe(false);
  });

  it('START toggles the transport; each 16th advances the playhead and triggers active voices', () => {
    c.toggleStep(0); // BD on step 0
    c.selectVoice('CH');
    c.toggleStep(0); // CH on step 0 too
    c.toggleStep(2); // CH on step 2
    c.togglePlay();
    expect(c.getState().playing).toBe(true);
    expect(transport.isRunning()).toBe(true);
    step(transport); // step 0 -> BD + CH
    expect(c.getState().currentStep).toBe(0);
    expect(synth.hits.sort()).toEqual(['BD', 'CH']);
    synth.hits = [];
    step(transport); // step 1 -> nothing
    expect(c.getState().currentStep).toBe(1);
    expect(synth.hits).toEqual([]);
    step(transport); // step 2 -> CH
    expect(synth.hits).toEqual(['CH']);
  });

  it('wraps the playhead after 16 steps (phase-locked to shared position)', () => {
    c.togglePlay();
    for (let i = 0; i < 16; i++) step(transport);
    expect(c.getState().currentStep).toBe(15);
    step(transport);
    expect(c.getState().currentStep).toBe(0);
  });

  it('stop pauses the transport and hides the playhead readout', () => {
    c.togglePlay();
    step(transport);
    c.togglePlay(); // stop
    expect(c.getState().playing).toBe(false);
    expect(c.getState().currentStep).toBe(-1);
    expect(transport.isRunning()).toBe(false);
  });

  it('power off mutes + hides the playhead but never stops the shared transport', () => {
    c.toggleStep(0);
    c.togglePlay();
    c.togglePower(); // off
    expect(c.getState().power).toBe(false);
    expect(c.getState().currentStep).toBe(-1); // playhead hidden while off
    expect(transport.isRunning()).toBe(true); // the rig keeps time
    expect(synth.muted).toBe(true);
    step(transport); // no triggers while off
    synth.hits = [];
    step(transport);
    expect(synth.hits).toEqual([]);
    c.toggleStep(4); // edits blocked while off
    expect(c.getState().pattern.BD[4]).toBe(false);
  });

  it('sets and persists per-voice levels, pushing them to the synth', () => {
    c.setLevel('SD', 0.4);
    expect(c.getState().levels.SD).toBe(0.4);
    expect(synth.levels.SD).toBe(0.4);
    c.setLevel('BD', 5); // clamps
    expect(c.getState().levels.BD).toBe(1);
    const synth2 = new SpySynth();
    const c2 = new DrumMachineController(synth2, new Transport(), store);
    expect(c2.getState().levels.SD).toBe(0.4);
    expect(synth2.levels.SD).toBe(0.4); // applied on construct
  });

  it('clamps bpm and volume (tempo goes to the shared transport)', () => {
    c.setBpm(9999);
    expect(c.getState().bpm).toBe(240); // clamped to the drum machine range
    expect(transport.getBpm()).toBe(240);
    c.setBpm(1);
    expect(c.getState().bpm).toBe(40);
    c.setVolume(2);
    expect(c.getState().volume).toBe(1);
  });

  it('persists the pattern/bpm/volume/voice and restores them (seeding the transport tempo)', () => {
    c.toggleStep(3);
    c.setBpm(140);
    c.setVolume(0.5);
    c.selectVoice('SD');
    expect(store.saved?.bpm).toBe(140);
    expect(store.saved?.pattern.BD[3]).toBe(true);
    const c2 = new DrumMachineController(new SpySynth(), new Transport(), store);
    expect(c2.getState()).toMatchObject({ bpm: 140, volume: 0.5, selected: 'SD' });
    expect(c2.getState().pattern.BD[3]).toBe(true);
  });

  it('does not write to storage on a transport tick (pattern unchanged)', () => {
    c.toggleStep(0);
    store.saved = null; // clear
    c.togglePlay();
    step(transport);
    step(transport);
    expect(store.saved).toBeNull(); // ticks moved the playhead but saved nothing
  });
});
