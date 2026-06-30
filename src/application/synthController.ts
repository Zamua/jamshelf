import {
  resolveChord,
  midiToFreq,
  arpOrder,
  leadNote,
  rateBeats,
  strumMs,
  voiceChord,
  drumForDegree,
  fxHasDelay,
  fxHasChorus,
  FX_MODES,
  INVERSIONS,
  NOTE_NAMES,
  SCALE_LABELS,
  SCALE_ORDER,
  PLAY_MODES,
  ARP_PATTERNS,
  RATES,
  STRUM_SPEEDS,
  BASS_MODES,
  GLIDE_MODES,
  glideSeconds,
  DRUM_KITS,
  type Degree,
  type Quality,
  type ScaleName,
  type KeyState,
  type Midi,
  type PlayMode,
  type ArpPattern,
  type Rate,
  type StrumSpeed,
  type BassMode,
  type GlideMode,
  type DrumKit,
  type FxMode,
} from '../domain/music';
import { PATCH_ORDER, type AudioLooper, type Clock, type PatchName, type SynthPort } from './ports';
import type { Listener, MenuKind, MenuRow, ViewModel } from './state';
import { coerceSettings, type SettingsSnapshot, type SettingsStore } from './persistence';

const KEY_FIELDS = ['KEY', 'SCL', 'OCT', 'BASS', 'FX', 'GLIDE'] as const;
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
  private patch: PatchName = 'SAW';
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
  private bass: BassMode = 'OFF';
  private fx: FxMode = 'OFF';
  private glide: GlideMode = 'OFF';
  private drumKit: DrumKit = 'TIGHT';
  private inversion = 0; // 0 = root position, 1 = 1st, 2 = 2nd
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
  private readonly looper: AudioLooper;
  private readonly settings: SettingsStore | null;
  private lastSavedJson = ''; // skip writing when the durable settings are unchanged

  constructor(synth: SynthPort, clock: Clock, looper: AudioLooper, settings?: SettingsStore) {
    this.synth = synth;
    this.clock = clock;
    this.looper = looper;
    this.settings = settings ?? null;
    // Restore persisted settings BEFORE the first apply so the side effects (patch,
    // volume, fx, glide, tempo, strum) reflect the saved values, not the defaults.
    const saved = this.settings?.load();
    if (saved) this.restoreSettings(saved);
    this.synth.setStrumMs(this.mode === 'STRUM' ? strumMs(this.strumSpeed) : PLAY_STRUM_MS);
    this.synth.setVolume(this.volume);
    this.synth.setPatch(this.patch);
    this.applyFx();
    this.applyGlide();
    this.clock.onTick(() => this.tick());
    this.clock.setBpm(this.bpm);
    this.looper.setBpm(this.bpm);
    this.looper.onChange(() => this.publish());
    // Seed the de-dupe baseline so the first publish doesn't re-save what we just loaded.
    this.lastSavedJson = JSON.stringify(this.snapshotSettings());
  }

  // --- persistence (durable settings to a SettingsStore; the looper persists itself) ---
  private snapshotSettings(): SettingsSnapshot {
    return {
      v: 1,
      root: this.root,
      scale: this.scale,
      octave: this.octave,
      patch: this.patch,
      bpm: this.bpm,
      volume: this.volume,
      themeIndex: this.themeIndex,
      mode: this.mode,
      arpPattern: this.arpPattern,
      arpRate: this.arpRate,
      repeatRate: this.repeatRate,
      strumSpeed: this.strumSpeed,
      bass: this.bass,
      fx: this.fx,
      glide: this.glide,
      drumKit: this.drumKit,
      inversion: this.inversion,
    };
  }
  // Reconstitute the durable settings from a stored payload. Validation/clamping is a
  // pure function (coerceSettings) so this is just field mapping; the constructor
  // applies the side effects (patch/volume/fx/glide/tempo/strum) afterward.
  private restoreSettings(raw: unknown): void {
    const s = coerceSettings(raw, this.snapshotSettings());
    this.root = s.root;
    this.scale = s.scale;
    this.octave = s.octave;
    this.patch = s.patch;
    this.bpm = s.bpm;
    this.volume = s.volume;
    this.themeIndex = s.themeIndex;
    this.mode = s.mode;
    this.arpPattern = s.arpPattern;
    this.arpRate = s.arpRate;
    this.repeatRate = s.repeatRate;
    this.strumSpeed = s.strumSpeed;
    this.bass = s.bass;
    this.fx = s.fx;
    this.glide = s.glide;
    this.drumKit = s.drumKit;
    this.inversion = s.inversion;
  }
  // Write the settings out when they actually change (called on every publish; the
  // de-dupe means a joystick morph or transport tick does not hit storage).
  private maybeSave(): void {
    if (!this.settings) return;
    const snap = this.snapshotSettings();
    const json = JSON.stringify(snap);
    if (json === this.lastSavedJson) return;
    this.lastSavedJson = json;
    this.settings.save(snap);
  }

  // --- looper (joystick click = record/overdub, long-press = clear) ---
  joyClick(): void {
    if (!this.power || this.inspect) return;
    this.looper.toggle();
  }
  joyHold(): void {
    if (!this.power || this.inspect) return;
    this.looper.clear();
  }
  // Joystick left/right while a loop plays + no pad is held: pick the layer the
  // long-press will clear / redo. The UI only calls this in that context.
  selectLoopTrack(dir: -1 | 1): void {
    if (!this.power || this.inspect) return;
    this.looper.selectTrack(dir);
  }
  // Joystick down (no pad held, loop playing): stop / restart the loops from the top.
  looperStop(): void {
    if (!this.power || this.inspect) return;
    this.looper.toggleStop();
    // Flash STOPPED once on the way into a stop, then let the screen fall back to the
    // live key/scale (the flash auto-reverts) so the word doesn't obstruct the OLED.
    if (this.looper.view().stopped) this.flash('STOPPED', 900);
    this.publish();
  }

  // --- lifecycle ---
  resume(): void {
    this.synth.resume();
  }

  // --- playing (multi-touch; voiceId is typically a pointer id) ---
  pressPad(voiceId: string, degree: Degree): void {
    if (!this.power || this.inspect) return;
    this.dispatchPress(voiceId, degree);
    this.looper.noteStarted(); // if the looper is armed, this first key begins the take

    if (this.mode === 'DRUM') {
      this.flash(drumForDegree(degree));
    } else if (!(this.mode === 'DRONE' && this.latched === null)) {
      // DRONE: pressing the latched pad again just silences it - nothing to announce.
      this.flash(this.tonalName(degree));
    }
    this.publish();
  }

  // Glissando: a held finger slid onto a different pad.
  movePad(voiceId: string, degree: Degree): void {
    if (!this.power || this.inspect) return;
    if (this.mode === 'DRONE' || this.mode === 'DRUM') return; // no glissando here
    if (this.held.get(voiceId) === degree) return;
    this.held.set(voiceId, degree);
    if (this.mode === 'LEAD') {
      // only re-voice if the slid finger is the newest (the note actually
      // sounding); otherwise we'd pointlessly re-attack the same lead note.
      if ([...this.held.keys()].pop() === voiceId) this.triggerLead();
    } else if (this.mode === 'PLAY' || this.mode === 'STRUM' || this.mode === 'REPEAT')
      this.triggerVoice(voiceId, degree);
    // ARP picks up the new held set on the next tick.
    this.flash(this.tonalName(degree));
    this.publish();
  }

  releasePad(voiceId: string): void {
    this.dispatchRelease(voiceId);
    this.looper.noteEnded(); // mark playing-ended for the looper's note-based length
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

  // LEAD mode: the joystick is a pitch bend (X) + octave glide (Y) instead of the
  // chord-quality morph. `cents` is the combined bend; only applied in LEAD.
  setLeadBend(cents: number): void {
    if (!this.power || this.inspect || this.mode !== 'LEAD') return;
    this.synth.setBend(cents);
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

  // Yellow button: with a pad held (or a drone latched), cycle the chord INVERSION
  // (root / 1st / 2nd), like the real device; otherwise cycle the synth voice.
  pressSound(): void {
    // Yellow is the sound action, not a menu: if a menu is open, leave it so the OLED
    // shows the instrument (or inversion) flashing instead of staying on the menu.
    this.closeMenu();
    if (this.held.size > 0 || this.latched !== null) this.cycleInversion();
    else this.cyclePatch();
  }
  cycleInversion(): void {
    this.inversion = (this.inversion + 1) % INVERSIONS;
    this.revoiceHeld();
    this.flash('INV ' + this.inversion);
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
      case 'DRUM':
        this.synth.drum(drumForDegree(degree), this.drumKit); // one-shot percussion
        return;
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
          this.applyMode(); // start the clock, phase-aligned to this press
          this.arpTick(); // immediate first step, then the clock continues
        }
        return;
      }
      case 'REPEAT': {
        const wasEmpty = this.held.size === 0;
        this.held.set(voiceId, degree);
        if (wasEmpty) this.applyMode(); // start the clock, phase-aligned to this press
        this.triggerVoice(voiceId, degree); // immediate hit; ticks re-pulse it
        return;
      }
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
        if (this.held.size === 0) {
          this.synth.noteOff(ARP_ID);
          this.applyMode(); // nothing held: stop the clock
        }
        return;
      case 'REPEAT':
        this.synth.noteOff(voiceId);
        if (this.held.size === 0) this.applyMode(); // nothing held: stop the clock
        return;
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
    // The clock runs ONLY while ARP/REPEAT actually has a pad held. Gating on
    // `held` (not just the mode) means the clock is (re)started at the first
    // press, so its phase aligns to the downbeat - no first-note flam - and it
    // never idles/ticks with nothing to play.
    const stepping =
      (this.mode === 'ARP' || this.mode === 'REPEAT') &&
      this.power &&
      !this.inspect &&
      this.held.size > 0;
    if (stepping) {
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
    } else if (field === 'OCT') {
      this.octave = Math.max(-2, Math.min(2, this.octave + delta));
    } else if (field === 'BASS') {
      const i = BASS_MODES.indexOf(this.bass);
      this.bass = BASS_MODES[(i + delta + BASS_MODES.length) % BASS_MODES.length];
    } else if (field === 'GLIDE') {
      const i = GLIDE_MODES.indexOf(this.glide);
      this.glide = GLIDE_MODES[(i + delta + GLIDE_MODES.length) % GLIDE_MODES.length];
      this.applyGlide();
    } else {
      // FX
      const i = FX_MODES.indexOf(this.fx);
      this.fx = FX_MODES[(i + delta + FX_MODES.length) % FX_MODES.length];
      this.applyFx();
    }
    this.revoiceHeld();
  }
  private applyFx(): void {
    const delayMs = 30000 / this.bpm; // an eighth note at the current tempo
    this.synth.setFx(fxHasDelay(this.fx), fxHasChorus(this.fx), delayMs);
  }
  private applyGlide(): void {
    this.synth.setGlide(glideSeconds(this.glide));
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
    } else if (field === 'KIT') {
      const i = DRUM_KITS.indexOf(this.drumKit);
      this.drumKit = DRUM_KITS[(i + delta + DRUM_KITS.length) % DRUM_KITS.length];
    } else {
      // BPM
      this.bpm = Math.max(40, Math.min(300, this.bpm + delta));
      this.looper.setBpm(this.bpm);
      this.applyMode();
      this.applyFx(); // re-sync the delay time to the new tempo
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
    else if (this.mode === 'DRUM') f.push('KIT');
    f.push('BPM');
    return f;
  }
  // The open menu as structured rows for the OLED (empty when no menu is open).
  private menuRows(): MenuRow[] {
    if (!this.menuOpen) return [];
    return this.fields().map((f, i) => ({
      label: f,
      value: this.fieldValue(f),
      active: i === this.menuIndex,
    }));
  }
  private fieldValue(field: string): string {
    switch (field) {
      case 'KEY':
        return NOTE_NAMES[this.root];
      case 'SCL':
        return SCALE_LABELS[this.scale];
      case 'OCT':
        return (this.octave >= 0 ? '+' : '') + this.octave;
      case 'BASS':
        return this.bass;
      case 'FX':
        return this.fx;
      case 'GLIDE':
        return this.glide;
      case 'MODE':
        return this.mode;
      case 'PATTERN':
        return this.arpPattern;
      case 'RATE':
        return this.mode === 'ARP' ? this.arpRate : this.repeatRate;
      case 'SPEED':
        return this.strumSpeed;
      case 'KIT':
        return this.drumKit;
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
  // The chord notes as actually voiced: resolve the degree, then apply the
  // inversion + bass (the joystick morph already baked into `quality`).
  private voiced(degree: Degree): Midi[] {
    const chord = resolveChord(degree, this.key(), this.quality);
    return voiceChord(chord.notes, this.inversion, this.bass);
  }
  private triggerVoice(voiceId: string, degree: Degree): void {
    this.synth.noteOn(voiceId, this.voiced(degree).map(midiToFreq));
  }
  // LEGATO re-voice of a SOUNDING pad: retune in place (no re-attack) - the chord morph.
  private retuneVoice(voiceId: string, degree: Degree): void {
    this.synth.retune(voiceId, this.voiced(degree).map(midiToFreq));
  }
  private triggerLead(legato = false): void {
    const last = [...this.held.values()].pop();
    if (last === undefined) {
      this.synth.noteOff(LEAD_ID);
      return;
    }
    const chord = resolveChord(last, this.key(), this.quality);
    const freq = midiToFreq(leadNote(chord.notes));
    if (legato) this.synth.retune(LEAD_ID, [freq]);
    else this.synth.noteOn(LEAD_ID, [freq]);
  }
  // Union of every held pad's chord notes (for the arpeggiator), sorted.
  private heldNotes(): Midi[] {
    const set = new Set<Midi>();
    for (const degree of this.held.values())
      for (const n of resolveChord(degree, this.key(), this.quality).notes) set.add(n);
    return [...set].sort((a, b) => a - b);
  }
  // Re-voice whatever is currently sounding (after a morph or key edit). Uses the LEGATO
  // retune (no re-attack) so morphing/editing a held chord slides in place, not re-plucks.
  private revoiceHeld(): void {
    if (!this.power || this.inspect) return;
    switch (this.mode) {
      case 'DRONE':
        if (this.latched !== null) this.retuneVoice(DRONE_ID, this.latched);
        return;
      case 'LEAD':
        this.triggerLead(true); // legato
        return;
      case 'ARP':
        return; // the next tick re-reads the held set with the new quality/key
      case 'REPEAT':
      case 'PLAY':
      case 'STRUM':
        for (const [voiceId, degree] of this.held) this.retuneVoice(voiceId, degree);
        return;
    }
  }
  // Silence everything and clear all play state (power-off, inspect, mode switch).
  private allNotesOff(): void {
    this.held.clear();
    this.latched = null;
    this.arpStep = 0;
    this.synth.releaseAll();
    this.synth.setBend(0); // clear any LEAD pitch bend (mode change / power / inspect)
  }
  private currentChordName(degree: Degree): string {
    return resolveChord(degree, this.key(), this.quality).name;
  }
  // LEAD mode sounds a SINGLE note (the chord root), so the OLED should name that note
  // (e.g. "C4"), not the chord. Octave uses the C4 = MIDI 60 convention.
  private leadNoteName(degree: Degree): string {
    const note = leadNote(resolveChord(degree, this.key(), this.quality).notes);
    return NOTE_NAMES[((note % 12) + 12) % 12] + (Math.floor(note / 12) - 1);
  }
  // The flashed name for a tonal pad: the single note in LEAD, else the chord name.
  private tonalName(degree: Degree): string {
    return this.mode === 'LEAD' ? this.leadNoteName(degree) : this.currentChordName(degree);
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
    const lv = this.looper.view();
    // Armed = waiting for the first key (the metronome is counting you in). While
    // recording, REC is the headline; while a loop plays, it shows in the small
    // line. Otherwise the usual key/chord + patch/mode.
    if (lv.mode === 'armed') {
      return { big: flashing ? this.flashText : keyScale, small: 'LOOP ARMED' };
    }
    if (lv.mode === 'rec') {
      // count-in (overdub) shows the 4..1 countdown; otherwise REC + the take number.
      const big = lv.countdown > 0 ? `COUNT ${lv.countdown}` : `REC ${lv.recTrack + 1}`;
      return { big, small: flashing ? this.flashText : keyScale };
    }
    if (lv.mode === 'play') {
      if (lv.stopped) {
        // Halted: STOPPED flashed once (looperStop); after it fades, show the live
        // key/scale so nothing obstructs the OLED, with a compact one-line marker
        // (`STOP n` = n halted layers) that fits without wrapping.
        return {
          big: flashing ? this.flashText : keyScale,
          small: `STOP ${lv.trackCount}`,
        };
      }
      // big line is the live transport (bar.beat), flashing to chord names as you
      // play; small line shows the selected layer + loop length.
      return {
        big: flashing ? this.flashText : `BAR ${lv.bar}.${lv.beat}`,
        small: `TRK ${lv.selected + 1}/${lv.trackCount} ${lv.loopBars}BR`,
      };
    }
    return { big: flashing ? this.flashText : keyScale, small: `${this.patch}  ${this.mode}` };
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
      looper: this.looper.view(),
      litPads,
      screenBig: big,
      screenSmall: small,
      menuRows: this.menuRows(),
    };
  }
  private publish(): void {
    this.maybeSave(); // persist durable settings if they changed (de-duped)
    const vm = this.snapshot();
    for (const fn of this.listeners) fn(vm);
  }
}
