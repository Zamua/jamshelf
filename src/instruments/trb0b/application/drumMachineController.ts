import {
  VOICES,
  STEPS,
  emptyPattern,
  toggleStep,
  clearVoice,
  voicesAtStep,
  type DrumVoice,
  type Pattern,
} from '../domain/sequencer';
import type { DrumMachinePort, DrumSettings, SettingsStore } from './ports';
import type { Clock, Transport } from '../../../transport/transport';
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

// Framework-agnostic controller for the TR-B0B, the sequenced backbone of a rig. It owns the
// pattern + sound but slaves its timing to the shared Transport (play/stop, tempo and position all
// live there - the drum machine never owns a second clock). A 16th-note sub-clock of the Transport
// advances the playhead; the step index is derived from the Transport's absolute tick, so it stays
// phase-locked and resumes correctly. START toggles the Transport (one play across the rig).
export class DrumMachineController {
  private power = true;
  private lastStep = 0; // playhead, derived from the Transport tick (index % STEPS)
  private selected: DrumVoice = 'BD';
  private pattern: Pattern = emptyPattern();
  private volume = 0.85;
  private levels: Record<DrumVoice, number> = defaultLevels();
  private inspect = false;

  private listeners = new Set<Listener>();
  private readonly synth: DrumMachinePort;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly settings: SettingsStore | null;
  private lastSavedJson = '';

  constructor(synth: DrumMachinePort, transport: Transport, settings?: SettingsStore) {
    this.synth = synth;
    this.transport = transport;
    this.settings = settings ?? null;

    const saved = this.settings?.load();
    if (saved) {
      const s = coerceSettings(saved, this.snapshotSettings());
      this.pattern = s.pattern;
      this.volume = s.volume;
      this.selected = s.selected;
      this.levels = s.levels;
      this.transport.setBpm(s.bpm); // seed the shared tempo from this instrument's saved bpm
    }
    this.synth.setVolume(this.volume);
    for (const v of VOICES) this.synth.setLevel(v, this.levels[v]);
    this.synth.setMuted(!this.power);

    // A 16th-note sub-clock of the shared Transport advances the sequencer. It is always "started"
    // (the sequencer always wants ticks); whether pulses actually arrive is the Transport's play/stop.
    this.clock = this.transport.clock();
    this.clock.setBeatsPerTick(0.25); // one step = a 16th note
    this.clock.onTick((tick) => this.onTick(tick));
    this.clock.start();
    // Redraw when the shared transport's play/stop or tempo changes (a rig peer can move them too).
    this.transport.onChange(() => this.publish());
    this.lastSavedJson = JSON.stringify(this.snapshotSettings());
  }

  // --- subscription ---
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  getState(): ViewModel {
    const running = this.transport.isRunning();
    return {
      power: this.power,
      playing: running,
      bpm: this.transport.getBpm(),
      currentStep: running && this.power ? this.lastStep : -1,
      selected: this.selected,
      pattern: this.pattern,
      volume: this.volume,
      levels: { ...this.levels },
      inspect: this.inspect,
    };
  }

  private snapshotSettings(): DrumSettings {
    return { pattern: this.pattern, bpm: this.transport.getBpm(), volume: this.volume, selected: this.selected, levels: { ...this.levels } };
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
  // `tick` is the Transport's absolute 16th index; the step is that modulo the pattern length, so
  // the playhead is a pure function of shared position (phase-locked, resumes correctly).
  private onTick(tick: number): void {
    this.lastStep = ((tick % STEPS) + STEPS) % STEPS;
    if (this.power) {
      for (const v of voicesAtStep(this.pattern, this.lastStep)) this.synth.trigger(v);
    }
    this.publish(); // move the playhead (does not hit storage - the pattern is unchanged)
  }

  // --- input ---
  resume(): void {
    this.synth.resume();
  }

  // START toggles the shared Transport - one play across the rig (the onChange subscription redraws).
  togglePlay(): void {
    if (!this.power) return;
    this.transport.toggle();
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
    this.transport.setBpm(clamp(Math.round(bpm), MIN_BPM, MAX_BPM)); // one tempo owner; onChange redraws
  }

  nudgeBpm(delta: number): void {
    this.setBpm(this.transport.getBpm() + delta);
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
    // Power only mutes THIS instrument; it never stops the shared Transport (a rig peer keeps time).
    // While off, the playhead hides (getState gates on power) and no voices trigger.
    this.synth.setMuted(!this.power);
    this.publish();
  }

  setInspect(on: boolean): void {
    this.inspect = on;
    this.publish();
  }
}
