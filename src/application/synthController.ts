import {
  resolveChord,
  midiToFreq,
  arpOrder,
  leadNote,
  rateBeats,
  strumMs,
  NOTE_NAMES,
  SCALE_LABELS,
  SCALE_ORDER,
  PLAY_MODES,
  ARP_PATTERNS,
  RATES,
  STRUM_SPEEDS,
  type Degree,
  type Quality,
  type ScaleName,
  type KeyState,
  type Midi,
  type PlayMode,
  type ArpPattern,
  type Rate,
  type StrumSpeed,
} from '../domain/music';
import { PATCH_ORDER, type Clock, type PatchName, type SynthPort } from './ports';
import type { Listener, MenuKind, ViewModel } from './state';

const KEY_FIELDS = ['KEY', 'SCL', 'OCT'] as const;
const PLAY_STRUM_MS = 4; // near-zero spread for the plain PLAY mode

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Fixed voice ids for the single-voice modes (DRONE latch, LEAD mono, ARP step).
const DRONE_ID = 'drone';
const LEAD_ID = 'lead';
const ARP_ID = 'arp';

// Application service: owns musical state, orchestrates the domain + the synth
// port + a tempo Clock, and publishes a ViewModel to any subscribed view.
// Framework-agnostic.
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
  private themeIndex = 0;

  // play modes
  private mode: PlayMode = 'PLAY';
  private arpPattern: ArpPattern = 'UP';
  private arpRate: Rate = '1/8';
  private repeatRate: Rate = '1/8';
  private strumSpeed: StrumSpeed = 'MED';
  private latched: Degree | null = null; // DRONE: the currently-sustained pad
  private arpStep = 0;

  // menu (one engine, two kinds: gray KEY menu, red MODE menu)
  private menuOpen = false;
  private menuKind: MenuKind = 'KEY';
  private menuIndex = 0;

  private held = new Map<string, Degree>(); // voiceId -> degree (the pressed pads)
  private flashText = '';
  private flashUntil = 0;
  private listeners = new Set<Listener>();
  private readonly synth: SynthPort;
  private readonly clock: Clock;

  constructor(synth: SynthPort, clock: Clock) {
    this.synth = synth;
    this.clock = clock;
    this.synth.setStrumMs(PLAY_STRUM_MS);
    this.synth.setVolume(this.volume);
    this.clock.onTick(() => this.tick());
    this.clock.setBpm(this.bpm);
  }

  // --- lifecycle ---
  resume(): void {
    this.synth.resume();
  }

  // --- playing (multi-touch; voiceId is typically a pointer id) ---
  pressPad(voiceId: string, degree: Degree): void {
    if (!this.power || this.inspect) return;
    this.dispatchPress(voiceId, degree);
    this.flash(this.currentChordName(degree));
    this.publish();
  }

  // Glissando: a held finger slid onto a different pad.
  movePad(voiceId: string, degree: Degree): void {
    if (!this.power || this.inspect) return;
    if (this.mode === 'DRONE') return; // drone latches on tap, not on slide
    if (this.held.get(voiceId) === degree) return;
    this.held.set(voiceId, degree);
    if (this.mode === 'LEAD') this.triggerLead();
    else if (this.mode === 'PLAY' || this.mode === 'STRUM' || this.mode === 'REPEAT')
      this.triggerVoice(voiceId, degree);
    // ARP picks up the new held set on the next tick.
    this.flash(this.currentChordName(degree));
    this.publish();
  }

  releasePad(voiceId: string): void {
    this.dispatchRelease(voiceId);
    this.publish();
  }

  // --- joystick chord morph ---
  setQuality(q: Quality): void {
    if (this.quality === q) return;
    this.quality = q;
    this.revoiceHeld(); // live morph of everything currently sounding
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

  // --- menus (gray = KEY, red = MODE; one engine) ---
  // Open the given menu; pressing the same menu's button again closes it, the
  // other button switches to that menu.
  toggleMenu(kind: MenuKind = 'KEY'): void {
    if (this.menuOpen && this.menuKind === kind) {
      this.menuOpen = false;
    } else {
      this.menuOpen = true;
      this.menuKind = kind;
      this.menuIndex = 0;
    }
    this.publish();
  }
  closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.publish();
  }
  // joystick up/down picks the field.
  cursorField(delta: -1 | 1): void {
    const fields = this.fields();
    this.menuIndex = (this.menuIndex + delta + fields.length) % fields.length;
    this.publish();
  }
  // joystick left/right edits the current field's value.
  editValue(delta: -1 | 1): void {
    const field = this.fields()[this.menuIndex];
    if (this.menuKind === 'KEY') this.editKeyField(field, delta);
    else this.editModeField(field, delta);
    this.publish();
  }

  // --- sound / power / volume ---
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

  togglePower(): void {
    this.power = !this.power;
    if (!this.power) {
      this.allNotesOff();
      this.synth.setMuted(true);
      this.menuOpen = false;
    } else {
      this.synth.setMuted(false);
    }
    this.applyMode(); // start/stop the clock to match power + mode
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
      this.allNotesOff();
      this.menuOpen = false;
    }
    this.applyMode(); // stop the clock while inspecting, restore it on return
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

  // --- play-mode dispatch -------------------------------------------------
  private dispatchPress(voiceId: string, degree: Degree): void {
    switch (this.mode) {
      case 'DRONE':
        if (this.latched === degree) {
          this.synth.noteOff(DRONE_ID);
          this.latched = null;
        } else {
          this.latched = degree;
          this.triggerVoice(DRONE_ID, degree);
        }
        return;
      case 'LEAD':
        this.held.set(voiceId, degree);
        this.triggerLead();
        return;
      case 'ARP': {
        const wasEmpty = this.held.size === 0;
        this.held.set(voiceId, degree);
        if (wasEmpty) {
          this.arpStep = 0;
          this.arpTick(); // respond immediately, then the clock continues
        }
        return;
      }
      case 'REPEAT':
        this.held.set(voiceId, degree);
        this.triggerVoice(voiceId, degree); // immediate hit; ticks re-pulse it
        return;
      case 'PLAY':
      case 'STRUM':
        this.held.set(voiceId, degree);
        this.triggerVoice(voiceId, degree);
        return;
    }
  }

  private dispatchRelease(voiceId: string): void {
    if (this.mode === 'DRONE') return; // latched; pad release is ignored
    if (!this.held.has(voiceId)) return;
    this.held.delete(voiceId);
    switch (this.mode) {
      case 'LEAD':
        if (this.held.size === 0) this.synth.noteOff(LEAD_ID);
        else this.triggerLead();
        return;
      case 'ARP':
        if (this.held.size === 0) this.synth.noteOff(ARP_ID);
        return;
      case 'REPEAT':
      case 'PLAY':
      case 'STRUM':
        this.synth.noteOff(voiceId);
        return;
    }
  }

  // --- clock tick (only ARP + REPEAT use it) ------------------------------
  private tick(): void {
    if (!this.power || this.inspect) return;
    if (this.mode === 'ARP') this.arpTick();
    else if (this.mode === 'REPEAT') this.repeatTick();
  }
  private arpTick(): void {
    const notes = this.heldNotes();
    if (notes.length === 0) {
      this.synth.noteOff(ARP_ID);
      return;
    }
    const order = arpOrder(notes, this.arpPattern);
    const note =
      this.arpPattern === 'RANDOM'
        ? notes[Math.floor(Math.random() * notes.length)]
        : order[this.arpStep % order.length];
    this.arpStep++;
    this.synth.noteOn(ARP_ID, [midiToFreq(note)]);
  }
  private repeatTick(): void {
    for (const [voiceId, degree] of this.held) this.triggerVoice(voiceId, degree);
  }

  // --- mode / clock configuration -----------------------------------------
  private applyMode(): void {
    this.synth.setStrumMs(this.mode === 'STRUM' ? strumMs(this.strumSpeed) : PLAY_STRUM_MS);
    if ((this.mode === 'ARP' || this.mode === 'REPEAT') && this.power && !this.inspect) {
      this.clock.setBpm(this.bpm);
      this.clock.setBeatsPerTick(rateBeats(this.mode === 'ARP' ? this.arpRate : this.repeatRate));
      this.clock.start();
    } else {
      this.clock.stop();
    }
  }
  private setMode(m: PlayMode): void {
    if (this.mode === m) return;
    this.allNotesOff(); // clear any mode-specific sounding voices
    this.mode = m;
    this.menuIndex = Math.min(this.menuIndex, this.fields().length - 1);
    this.applyMode();
  }

  // --- field editing ------------------------------------------------------
  private editKeyField(field: string, delta: -1 | 1): void {
    if (field === 'KEY') {
      this.root = (this.root + delta + 12) % 12;
    } else if (field === 'SCL') {
      const i = SCALE_ORDER.indexOf(this.scale);
      this.scale = SCALE_ORDER[(i + delta + SCALE_ORDER.length) % SCALE_ORDER.length];
    } else {
      this.octave = Math.max(-1, Math.min(2, this.octave + delta));
    }
    this.revoiceHeld();
  }
  private editModeField(field: string, delta: -1 | 1): void {
    if (field === 'MODE') {
      const i = PLAY_MODES.indexOf(this.mode);
      this.setMode(PLAY_MODES[(i + delta + PLAY_MODES.length) % PLAY_MODES.length]);
    } else if (field === 'PATTERN') {
      const i = ARP_PATTERNS.indexOf(this.arpPattern);
      this.arpPattern = ARP_PATTERNS[(i + delta + ARP_PATTERNS.length) % ARP_PATTERNS.length];
    } else if (field === 'SPEED') {
      const i = STRUM_SPEEDS.indexOf(this.strumSpeed);
      this.strumSpeed = STRUM_SPEEDS[(i + delta + STRUM_SPEEDS.length) % STRUM_SPEEDS.length];
      this.applyMode();
    } else if (field === 'RATE') {
      const i = RATES.indexOf(this.mode === 'ARP' ? this.arpRate : this.repeatRate);
      const next = RATES[(i + delta + RATES.length) % RATES.length];
      if (this.mode === 'ARP') this.arpRate = next;
      else this.repeatRate = next;
      this.applyMode();
    } else {
      // BPM
      this.bpm = Math.max(40, Math.min(300, this.bpm + delta));
      this.applyMode();
    }
  }

  // The fields of the currently-open menu. The MODE menu's fields depend on the
  // active mode (only ARP has a pattern, only STRUM a speed, etc.) - one engine,
  // a context-dependent field set.
  private fields(): readonly string[] {
    if (this.menuKind === 'KEY') return KEY_FIELDS;
    const f = ['MODE'];
    if (this.mode === 'ARP') f.push('PATTERN', 'RATE');
    else if (this.mode === 'STRUM') f.push('SPEED');
    else if (this.mode === 'REPEAT') f.push('RATE');
    f.push('BPM');
    return f;
  }
  private fieldValue(field: string): string {
    switch (field) {
      case 'KEY':
        return NOTE_NAMES[this.root];
      case 'SCL':
        return SCALE_LABELS[this.scale];
      case 'OCT':
        return (this.octave >= 0 ? '+' : '') + this.octave;
      case 'MODE':
        return this.mode;
      case 'PATTERN':
        return this.arpPattern;
      case 'RATE':
        return this.mode === 'ARP' ? this.arpRate : this.repeatRate;
      case 'SPEED':
        return this.strumSpeed;
      case 'BPM':
        return String(this.bpm);
      default:
        return '';
    }
  }

  // --- internals ----------------------------------------------------------
  private key(): KeyState {
    return { root: this.root, scale: this.scale, octave: this.octave };
  }
  private triggerVoice(voiceId: string, degree: Degree): void {
    const chord = resolveChord(degree, this.key(), this.quality);
    this.synth.noteOn(voiceId, chord.notes.map(midiToFreq));
  }
  private triggerLead(): void {
    const last = [...this.held.values()].pop();
    if (last === undefined) {
      this.synth.noteOff(LEAD_ID);
      return;
    }
    const chord = resolveChord(last, this.key(), this.quality);
    this.synth.noteOn(LEAD_ID, [midiToFreq(leadNote(chord.notes))]);
  }
  // Union of every held pad's chord notes (for the arpeggiator), sorted.
  private heldNotes(): Midi[] {
    const set = new Set<Midi>();
    for (const degree of this.held.values())
      for (const n of resolveChord(degree, this.key(), this.quality).notes) set.add(n);
    return [...set].sort((a, b) => a - b);
  }
  // Re-voice whatever is currently sounding (after a morph or key edit).
  private revoiceHeld(): void {
    if (!this.power || this.inspect) return;
    switch (this.mode) {
      case 'DRONE':
        if (this.latched !== null) this.triggerVoice(DRONE_ID, this.latched);
        return;
      case 'LEAD':
        this.triggerLead();
        return;
      case 'ARP':
        return; // the next tick re-reads the held set with the new quality/key
      case 'REPEAT':
      case 'PLAY':
      case 'STRUM':
        for (const [voiceId, degree] of this.held) this.triggerVoice(voiceId, degree);
        return;
    }
  }
  // Silence everything and clear all play state (power-off, inspect, mode switch).
  private allNotesOff(): void {
    this.held.clear();
    this.latched = null;
    this.arpStep = 0;
    this.synth.releaseAll();
  }
  private currentChordName(degree: Degree): string {
    return resolveChord(degree, this.key(), this.quality).name;
  }
  private flash(text: string, ms = 700): void {
    this.flashText = text;
    this.flashUntil = now() + ms;
    setTimeout(() => this.publish(), ms + 20);
  }

  // The two OLED lines. While a menu is open it shows the live menu (active field
  // with a cursor + the other fields compactly); closed, it shows key+scale (or a
  // flashed chord/quality) and the patch + mode.
  private screenLines(): { big: string; small: string } {
    if (this.menuOpen) {
      const fields = this.fields();
      const active = fields[this.menuIndex];
      const big = `>${active} ${this.fieldValue(active)}`;
      const small = fields
        .filter((_, i) => i !== this.menuIndex)
        .map((f) => `${f.slice(0, 3)} ${this.fieldValue(f)}`)
        .join('  ');
      return { big, small };
    }
    const flashing = now() < this.flashUntil;
    const keyScale = `${NOTE_NAMES[this.root]} ${SCALE_LABELS[this.scale]}`;
    return {
      big: flashing ? this.flashText : keyScale,
      small: `${this.patch}  ${this.mode}`,
    };
  }

  private menuFieldViews(): ViewModel['menuFields'] {
    if (!this.menuOpen) return [];
    return this.fields().map((f, i) => ({
      label: f,
      value: this.fieldValue(f),
      active: i === this.menuIndex,
    }));
  }

  private snapshot(): ViewModel {
    const { big, small } = this.screenLines();
    const litPads =
      this.mode === 'DRONE'
        ? this.latched !== null
          ? [this.latched]
          : []
        : [...this.held.values()];
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
      mode: this.mode,
      menuOpen: this.menuOpen,
      menuKind: this.menuKind,
      menuField: this.menuOpen ? this.fields()[this.menuIndex] : '',
      menuFields: this.menuFieldViews(),
      litPads,
      screenBig: big,
      screenSmall: small,
    };
  }
  private publish(): void {
    const vm = this.snapshot();
    for (const fn of this.listeners) fn(vm);
  }
}
