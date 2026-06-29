import type { DrumName, DrumKit } from '../../domain/music';
import type { AudioLooper, Clock, LooperMode, LooperView, PatchName, SynthPort } from '../ports';

// A stand-in AudioLooper that records the controller's calls and lets a test drive
// the reported mode (so the OLED + "first key begins the take" wiring is testable
// without a real AudioContext - the actual audio capture is verified in-browser).
export class FakeAudioLooper implements AudioLooper {
  toggles = 0;
  cleared = 0;
  notes = 0; // noteStarted() calls
  bpm = -1;
  mode: LooperMode = 'idle';
  trackCount = 0;
  recTrack = -1;
  selected = 0;
  loopBars = 0;
  selectDirs: number[] = [];
  private cb: (() => void) | null = null;

  toggle(): void {
    this.toggles++;
  }
  clear(): void {
    this.cleared++;
  }
  selectTrack(dir: -1 | 1): void {
    this.selectDirs.push(dir);
  }
  noteStarted(): void {
    this.notes++;
  }
  setBpm(bpm: number): void {
    this.bpm = bpm;
  }
  view(): LooperView {
    return {
      mode: this.mode,
      recTrack: this.recTrack,
      trackCount: this.trackCount,
      selected: this.selected,
      loopBars: this.loopBars,
      posFraction: 0,
    };
  }
  onChange(cb: () => void): void {
    this.cb = cb;
  }
  // test-only: force a view state + notify the controller (mimics the real looper
  // emitting on a state change).
  emit(): void {
    this.cb?.();
  }
}

// A Clock you tick by hand, so the controller's arp/repeat logic is deterministic
// in tests (no real timers). `tick()` fires subscribers only while "running".
export class FakeClock implements Clock {
  bpm = 0;
  beats = 0;
  running = false;
  private subs = new Set<() => void>();

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }
  setBeatsPerTick(beats: number): void {
    this.beats = beats;
  }
  start(): void {
    this.running = true;
  }
  stop(): void {
    this.running = false;
  }
  onTick(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  // test-only: fire one tick to every subscriber (no-op while stopped).
  tick(): void {
    if (!this.running) return;
    for (const cb of this.subs) cb();
  }
}

interface OnCall {
  id: string;
  freqs: number[];
  patch?: PatchName;
}

// A SynthPort that records every call + models which voice ids are sounding.
export class SpySynth implements SynthPort {
  on: OnCall[] = [];
  off: string[] = [];
  releasedAll = 0;
  patch: PatchName = 'SAW';
  strum = -1;
  vol = -1;
  muted = false;
  sounding = new Set<string>();

  resume(): void {}
  noteOn(id: string, freqs: number[], patch?: PatchName): void {
    this.on.push({ id, freqs: [...freqs], patch });
    this.sounding.add(id);
  }
  noteOff(id: string): void {
    this.off.push(id);
    this.sounding.delete(id);
  }
  releaseAll(): void {
    this.releasedAll++;
    this.sounding.clear();
  }
  setPatch(p: PatchName): void {
    this.patch = p;
  }
  setVolume(v: number): void {
    this.vol = v;
  }
  setStrumMs(ms: number): void {
    this.strum = ms;
  }
  setMuted(m: boolean): void {
    this.muted = m;
  }
  drums: DrumName[] = [];
  drumKits: DrumKit[] = [];
  drum(name: DrumName, kit: DrumKit): void {
    this.drums.push(name);
    this.drumKits.push(kit);
  }
  fx = { delay: false, chorus: false, delayMs: 0 };
  setFx(delay: boolean, chorus: boolean, delayMs: number): void {
    this.fx = { delay, chorus, delayMs };
  }

  // helpers
  lastOn(): OnCall {
    return this.on[this.on.length - 1];
  }
  onIds(): string[] {
    return this.on.map((c) => c.id);
  }
}
