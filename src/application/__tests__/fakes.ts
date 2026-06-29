import type { Clock, PatchName, SynthPort, Ticker } from '../ports';

// A frame ticker you drive by hand: call frame(nowMs) to advance the looper.
export class FakeTicker implements Ticker {
  private cb: ((n: number) => void) | null = null;
  start(cb: (n: number) => void): void {
    this.cb = cb;
  }
  stop(): void {
    this.cb = null;
  }
  frame(nowMs: number): void {
    this.cb?.(nowMs);
  }
  get running(): boolean {
    return this.cb !== null;
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

  // helpers
  lastOn(): OnCall {
    return this.on[this.on.length - 1];
  }
  onIds(): string[] {
    return this.on.map((c) => c.id);
  }
}
