import {
  resolveChord,
  midiToFreq,
  NOTE_NAMES,
  SCALE_LABELS,
  SCALE_ORDER,
  type Degree,
  type Quality,
  type ScaleName,
  type KeyState,
} from '../domain/music';
import { PATCH_ORDER, type PatchName, type SynthPort } from './ports';
import type { Listener, MenuField, ViewModel } from './state';

const MENU_FIELDS: readonly MenuField[] = ['KEY', 'SCL', 'OCT'];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Application service: owns musical state, orchestrates the domain + the synth
// port, and publishes a ViewModel to any subscribed view. Framework-agnostic.
export class SynthController {
  private root = 0;
  private scale: ScaleName = 'MAJOR';
  private octave = 0;
  private quality: Quality = 'TRIAD';
  private patch: PatchName = 'POLY';
  private bpm = 120;
  private volume = 0.8;
  private power = true;
  private inspect = false;
  private menuOpen = false;
  private menuField: MenuField = 'KEY';
  private themeIndex = 0;

  private held = new Map<string, Degree>(); // voiceId -> degree
  private flashText = '';
  private flashUntil = 0;
  private listeners = new Set<Listener>();
  private readonly synth: SynthPort;

  constructor(synth: SynthPort) {
    this.synth = synth;
    this.synth.setStrumMs(this.strumMs());
    this.synth.setVolume(this.volume);
  }

  // --- lifecycle ---
  resume(): void {
    this.synth.resume();
  }

  // --- playing (multi-touch; voiceId is typically a pointer id) ---
  pressPad(voiceId: string, degree: Degree): void {
    if (!this.power || this.inspect) return;
    this.held.set(voiceId, degree);
    this.trigger(voiceId, degree);
    this.flash(this.currentChordName(degree));
    this.publish();
  }

  // Glissando: a held finger slid onto a different pad.
  movePad(voiceId: string, degree: Degree): void {
    if (!this.power || this.inspect) return;
    if (this.held.get(voiceId) === degree) return;
    this.held.set(voiceId, degree);
    this.trigger(voiceId, degree); // noteOn with the same id replaces the group
    this.flash(this.currentChordName(degree));
    this.publish();
  }

  releasePad(voiceId: string): void {
    if (!this.held.has(voiceId)) return;
    this.held.delete(voiceId);
    this.synth.noteOff(voiceId);
    this.publish();
  }

  // --- joystick chord morph ---
  setQuality(q: Quality): void {
    if (this.quality === q) return;
    this.quality = q;
    this.revoiceHeld(); // live morph of everything currently held
    this.flash(q);
    this.publish();
  }

  // Releasing the joystick snaps the held chords back to a plain triad.
  springToTriad(): void {
    if (this.quality === 'TRIAD') return;
    this.quality = 'TRIAD';
    this.revoiceHeld();
    this.publish();
  }

  // --- gray Key menu (key / scale / octave) ---
  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    this.publish();
  }
  closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.publish();
  }
  // joystick up/down picks the field.
  cursorField(delta: -1 | 1): void {
    const i = MENU_FIELDS.indexOf(this.menuField);
    this.menuField = MENU_FIELDS[(i + delta + MENU_FIELDS.length) % MENU_FIELDS.length];
    this.publish();
  }
  // joystick left/right edits the current field's value.
  editValue(delta: -1 | 1): void {
    if (this.menuField === 'KEY') {
      this.root = (this.root + delta + 12) % 12;
    } else if (this.menuField === 'SCL') {
      const i = SCALE_ORDER.indexOf(this.scale);
      this.scale = SCALE_ORDER[(i + delta + SCALE_ORDER.length) % SCALE_ORDER.length];
    } else {
      this.octave = Math.max(-1, Math.min(2, this.octave + delta));
    }
    this.revoiceHeld();
    this.publish();
  }

  // --- sound / tempo / power / volume ---
  cyclePatch(): void {
    const i = PATCH_ORDER.indexOf(this.patch);
    this.patch = PATCH_ORDER[(i + 1) % PATCH_ORDER.length];
    this.synth.setPatch(this.patch);
    this.flash(this.patch);
    this.publish();
  }
  setPatch(patch: PatchName): void {
    this.patch = patch;
    this.synth.setPatch(patch);
    this.flash(patch);
    this.publish();
  }

  private lastTap = 0;
  tapTempo(): void {
    const t = now();
    if (this.lastTap) {
      const interval = t - this.lastTap;
      if (interval < 3000) {
        this.bpm = Math.max(40, Math.min(240, Math.round(60000 / interval)));
        this.synth.setStrumMs(this.strumMs());
      }
    }
    this.lastTap = t;
    this.flash(this.bpm + ' BPM', 1500);
    this.publish();
  }

  togglePower(): void {
    this.power = !this.power;
    if (!this.power) {
      this.held.clear();
      this.synth.releaseAll();
      this.synth.setMuted(true);
      this.menuOpen = false;
    } else {
      this.synth.setMuted(false);
    }
    this.publish();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.synth.setVolume(this.volume);
    this.publish();
  }
  nudgeVolume(delta: number): void {
    this.setVolume(this.volume + delta);
    this.flash('VOL ' + Math.round(this.volume * 8));
  }

  // Cycle the shell-color edition. Unbounded counter; the UI maps it modulo the
  // number of editions, so no presentation detail leaks into the app layer.
  swapColor(): void {
    this.themeIndex += 1;
    this.publish();
  }

  setInspect(on: boolean): void {
    if (this.inspect === on) return;
    this.inspect = on;
    if (on) {
      this.held.clear();
      this.synth.releaseAll();
      this.menuOpen = false;
    }
    this.publish();
  }

  // --- subscription ---
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }
  getState(): ViewModel {
    return this.snapshot();
  }

  // --- internals ---
  private key(): KeyState {
    return { root: this.root, scale: this.scale, octave: this.octave };
  }
  private trigger(voiceId: string, degree: Degree): void {
    const chord = resolveChord(degree, this.key(), this.quality);
    this.synth.noteOn(voiceId, chord.notes.map(midiToFreq));
  }
  private revoiceHeld(): void {
    if (!this.power || this.inspect) return;
    for (const [voiceId, degree] of this.held) this.trigger(voiceId, degree);
  }
  private currentChordName(degree: Degree): string {
    return resolveChord(degree, this.key(), this.quality).name;
  }
  private strumMs(): number {
    return Math.min(8, Math.max(0, 60000 / this.bpm / 8));
  }
  private flash(text: string, ms = 700): void {
    this.flashText = text;
    this.flashUntil = now() + ms;
    setTimeout(() => this.publish(), ms + 20);
  }
  private snapshot(): ViewModel {
    const flashing = now() < this.flashUntil;
    const keyScale = `${NOTE_NAMES[this.root]} ${SCALE_LABELS[this.scale]}`;
    return {
      root: this.root,
      scale: this.scale,
      octave: this.octave,
      quality: this.quality,
      patch: this.patch,
      bpm: this.bpm,
      volume: this.volume,
      power: this.power,
      inspect: this.inspect,
      themeIndex: this.themeIndex,
      menuOpen: this.menuOpen,
      menuField: this.menuField,
      litPads: [...this.held.values()],
      screenBig: flashing ? this.flashText : keyScale,
      screenSmall: `${this.patch}  ${this.bpm}`,
    };
  }
  private publish(): void {
    const vm = this.snapshot();
    for (const fn of this.listeners) fn(vm);
  }
}
