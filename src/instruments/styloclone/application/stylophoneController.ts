import { isPlayable, midiToFreq, noteName, type Midi } from '../domain/keyboard';
import { VOICE_ORDER, type StylophonePort, type SettingsStore, type StylophoneSettings, type VoiceName } from './ports';
import { TUNE_RANGE_CENTS, type Listener, type ViewModel } from './state';

// midiToFreq is imported so the domain (not this layer) owns pitch math; the controller
// only speaks MIDI to the port. (Referenced here to keep the dependency explicit.)
void midiToFreq;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Pure validation of a stored settings payload: every field checked against its domain /
// clamped to range, so a stale or hand-edited payload can never set invalid state - it
// falls back per-field. Mirrors the HiClone's coerceSettings discipline.
export function coerceSettings(raw: unknown, fallback: StylophoneSettings): StylophoneSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const voice = VOICE_ORDER.includes(o.voice as VoiceName) ? (o.voice as VoiceName) : fallback.voice;
  const vibrato = typeof o.vibrato === 'boolean' ? o.vibrato : fallback.vibrato;
  const tune = typeof o.tune === 'number' && Number.isFinite(o.tune)
    ? clamp(o.tune, -TUNE_RANGE_CENTS, TUNE_RANGE_CENTS)
    : fallback.tune;
  const volume = typeof o.volume === 'number' && Number.isFinite(o.volume) ? clamp(o.volume, 0, 1) : fallback.volume;
  return { voice, vibrato, tune, volume };
}

// Framework-agnostic controller for the StyloClone. Owns the instrument state, drives the
// StylophonePort, and publishes a ViewModel to any subscribed view. Strictly monophonic:
// one key sounds at a time; touching a new key retriggers the single voice.
export class StylophoneController {
  private power = true;
  private litKey: Midi | null = null;
  private vibrato = false;
  private tune = 0; // cents
  private volume = 0.8;
  private voice: VoiceName = 'BUZZ';
  private inspect = false;

  private listeners = new Set<Listener>();
  private readonly synth: StylophonePort;
  private readonly settings: SettingsStore | null;
  private lastSavedJson = '';

  constructor(synth: StylophonePort, settings?: SettingsStore) {
    this.synth = synth;
    this.settings = settings ?? null;
    // Restore persisted settings BEFORE the first apply so the side effects reflect the
    // saved values, not the defaults.
    const saved = this.settings?.load();
    if (saved) {
      const s = coerceSettings(saved, this.snapshotSettings());
      this.voice = s.voice;
      this.vibrato = s.vibrato;
      this.tune = s.tune;
      this.volume = s.volume;
    }
    this.synth.setVoice(this.voice);
    this.synth.setVibrato(this.vibrato);
    this.synth.setTune(this.tune);
    this.synth.setVolume(this.volume);
    this.synth.setMuted(!this.power);
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
      litKey: this.litKey,
      vibrato: this.vibrato,
      tune: this.tune,
      volume: this.volume,
      voice: this.voice,
      inspect: this.inspect,
      noteLabel: this.litKey !== null ? noteName(this.litKey) : '',
    };
  }

  private snapshotSettings(): StylophoneSettings {
    return { voice: this.voice, vibrato: this.vibrato, tune: this.tune, volume: this.volume };
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

  // --- input from the device (semantic-free; the UI translates raw input to these) ---

  // Unlock audio on the first user gesture.
  resume(): void {
    this.synth.resume();
  }

  // Stylus touched a key. Ignored when powered off or off the keyboard range. Retriggers
  // the mono voice to this pitch (a slur when the stylus drags across keys).
  pressKey(midi: Midi): void {
    if (!this.power || !isPlayable(midi)) return;
    if (this.litKey === midi) return; // already sounding this key (drag jitter)
    this.litKey = midi;
    this.synth.noteOn(midi);
    this.publish();
  }

  // Stylus lifted off the keyboard.
  releaseKey(): void {
    if (this.litKey === null) return;
    this.litKey = null;
    this.synth.noteOff();
    this.publish();
  }

  toggleVibrato(): void {
    this.vibrato = !this.vibrato;
    this.synth.setVibrato(this.vibrato);
    this.publish();
  }

  setTune(cents: number): void {
    this.tune = clamp(cents, -TUNE_RANGE_CENTS, TUNE_RANGE_CENTS);
    this.synth.setTune(this.tune);
    this.publish();
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    this.synth.setVolume(this.volume);
    this.publish();
  }

  // Cycle to the next voice (the front sound selector on the reissue).
  nextVoice(): void {
    const i = VOICE_ORDER.indexOf(this.voice);
    this.voice = VOICE_ORDER[(i + 1) % VOICE_ORDER.length];
    this.synth.setVoice(this.voice);
    this.publish();
  }

  togglePower(): void {
    this.power = !this.power;
    if (!this.power) {
      // powering off releases any sounding note and mutes
      this.litKey = null;
      this.synth.noteOff();
    }
    this.synth.setMuted(!this.power);
    this.publish();
  }

  setInspect(on: boolean): void {
    this.inspect = on;
    this.publish();
  }
}
