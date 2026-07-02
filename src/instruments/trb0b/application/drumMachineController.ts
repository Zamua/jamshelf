import {
  VOICES,
  STEPS,
  emptyPattern,
  toggleStep,
  clearVoice,
  nextStep,
  voicesAtStep,
  type DrumVoice,
  type Pattern,
} from '../domain/sequencer';
import type { Clock, DrumMachinePort, DrumSettings, SettingsStore } from './ports';
import { MAX_BPM, MIN_BPM, defaultLevels, type Listener, type ViewModel } from './state';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Pure validation of a stored settings payload: a bad/old/hand-edited payload can never set invalid
// state - each field is checked + clamped, falling back per-field. The pattern is rebuilt cell by
// cell so a wrong shape degrades to empty rather than throwing.
export function coerceSettings(raw: unknown, fallback: DrumSettings): DrumSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const pattern = emptyPattern();
  const rawPat = (o.pattern ?? {}) as Record<string, unknown>;
  for (const v of VOICES) {
    const row = rawPat[v];
    if (Array.isArray(row)) {
      for (let i = 0; i < STEPS; i++) pattern[v][i] = row[i] === true;
    }
  }
  const bpm = typeof o.bpm === 'number' && Number.isFinite(o.bpm) ? clamp(o.bpm, MIN_BPM, MAX_BPM) : fallback.bpm;
  const volume = typeof o.volume === 'number' && Number.isFinite(o.volume) ? clamp(o.volume, 0, 1) : fallback.volume;
  const selected = VOICES.includes(o.selected as DrumVoice) ? (o.selected as DrumVoice) : fallback.selected;
  const levels = defaultLevels();
  const rawLev = (o.levels ?? {}) as Record<string, unknown>;
  for (const v of VOICES) {
    const lv = rawLev[v];
    if (typeof lv === 'number' && Number.isFinite(lv)) levels[v] = clamp(lv, 0, 1);
  }
  return { pattern, bpm, volume, selected, levels };
}

// Framework-agnostic controller for the TR-B0B. Owns the pattern + transport, drives the
// DrumMachinePort, and publishes a ViewModel. A 16th-note Clock tick advances the playhead and
// triggers whichever voices are active on that step.
export class DrumMachineController {
  private power = true;
  private playing = false;
  private bpm = 120;
  private step = -1; // playhead; -1 when stopped, so the first tick lands on step 0
  private selected: DrumVoice = 'BD';
  private pattern: Pattern = emptyPattern();
  private volume = 0.85;
  private levels: Record<DrumVoice, number> = defaultLevels();
  private inspect = false;

  private listeners = new Set<Listener>();
  private readonly synth: DrumMachinePort;
  private readonly clock: Clock;
  private readonly settings: SettingsStore | null;
  private lastSavedJson = '';

  constructor(synth: DrumMachinePort, clock: Clock, settings?: SettingsStore) {
    this.synth = synth;
    this.clock = clock;
    this.settings = settings ?? null;

    const saved = this.settings?.load();
    if (saved) {
      const s = coerceSettings(saved, this.snapshotSettings());
      this.pattern = s.pattern;
      this.bpm = s.bpm;
      this.volume = s.volume;
      this.selected = s.selected;
      this.levels = s.levels;
    }
    this.synth.setVolume(this.volume);
    for (const v of VOICES) this.synth.setLevel(v, this.levels[v]);
    this.synth.setMuted(!this.power);
    this.clock.setBeatsPerTick(0.25); // one step = a 16th note
    this.clock.setBpm(this.bpm);
    this.clock.onTick(() => this.tick());
    this.lastSavedJson = JSON.stringify(this.snapshotSettings());
  }

  // --- subscription ---
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  getState(): ViewModel {
    return {
      power: this.power,
      playing: this.playing,
      bpm: this.bpm,
      currentStep: this.playing ? this.step : -1,
      selected: this.selected,
      pattern: this.pattern,
      volume: this.volume,
      levels: { ...this.levels },
      inspect: this.inspect,
    };
  }

  private snapshotSettings(): DrumSettings {
    return { pattern: this.pattern, bpm: this.bpm, volume: this.volume, selected: this.selected, levels: { ...this.levels } };
  }

  private maybeSave(): void {
    if (!this.settings) return;
    const json = JSON.stringify(this.snapshotSettings());
    if (json === this.lastSavedJson) return;
    this.lastSavedJson = json;
    this.settings.save(this.snapshotSettings());
  }

  private publish(): void {
    this.maybeSave();
    const vm = this.getState();
    for (const fn of this.listeners) fn(vm);
  }

  // --- the transport tick ---
  private tick(): void {
    this.step = nextStep(this.step);
    if (this.power) {
      for (const v of voicesAtStep(this.pattern, this.step)) this.synth.trigger(v);
    }
    this.publish(); // move the playhead (does not hit storage - the pattern is unchanged)
  }

  // --- input ---
  resume(): void {
    this.synth.resume();
  }

  togglePlay(): void {
    if (!this.power) return;
    this.playing = !this.playing;
    if (this.playing) {
      this.step = -1; // first tick lands on step 0
      this.clock.setBpm(this.bpm);
      this.clock.start();
    } else {
      this.clock.stop();
    }
    this.publish();
  }

  // Toggle a step of the SELECTED voice.
  toggleStep(step: number): void {
    if (!this.power) return;
    this.pattern = toggleStep(this.pattern, this.selected, step);
    this.publish();
  }

  selectVoice(voice: DrumVoice): void {
    this.selected = voice;
    this.publish();
  }

  clearSelected(): void {
    this.pattern = clearVoice(this.pattern, this.selected);
    this.publish();
  }

  clearAll(): void {
    this.pattern = emptyPattern();
    this.publish();
  }

  setBpm(bpm: number): void {
    this.bpm = clamp(Math.round(bpm), MIN_BPM, MAX_BPM);
    this.clock.setBpm(this.bpm);
    this.publish();
  }

  nudgeBpm(delta: number): void {
    this.setBpm(this.bpm + delta);
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    this.synth.setVolume(this.volume);
    this.publish();
  }

  // The per-voice LEVEL knob (the 808's per-instrument level).
  setLevel(voice: DrumVoice, level: number): void {
    this.levels = { ...this.levels, [voice]: clamp(level, 0, 1) };
    this.synth.setLevel(voice, this.levels[voice]);
    this.publish();
  }

  togglePower(): void {
    this.power = !this.power;
    if (!this.power) {
      this.playing = false;
      this.clock.stop();
    }
    this.synth.setMuted(!this.power);
    this.publish();
  }

  setInspect(on: boolean): void {
    this.inspect = on;
    this.publish();
  }
}
