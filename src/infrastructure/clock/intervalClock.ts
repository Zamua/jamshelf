import type { Clock } from '../../application/ports';

// setInterval-backed Clock. Fires its subscribers once per tick at
// (60000 / bpm * beatsPerTick) ms. Re-arms on tempo / subdivision changes while
// running; idempotent start; SSR-safe (no timer until start). Accurate enough for
// a browser instrument; could be swapped for an AudioContext look-ahead scheduler
// later without touching the application (the Clock port stays the same).
export class IntervalClock implements Clock {
  private bpm = 120;
  private beatsPerTick = 0.5; // an eighth note
  private timer: ReturnType<typeof setInterval> | null = null;
  private subs = new Set<() => void>();

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    this.bpm = bpm;
    this.rearm();
  }

  setBeatsPerTick(beats: number): void {
    if (!Number.isFinite(beats) || beats <= 0) return;
    this.beatsPerTick = beats;
    this.rearm();
  }

  start(): void {
    if (this.timer !== null) return; // already running
    this.arm();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  onTick(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  // --- internals ---
  private intervalMs(): number {
    return (60000 / this.bpm) * this.beatsPerTick;
  }
  private arm(): void {
    this.timer = setInterval(() => {
      for (const cb of this.subs) cb();
    }, this.intervalMs());
  }
  private rearm(): void {
    if (this.timer === null) return; // only matters while running
    clearInterval(this.timer);
    this.arm();
  }
}
