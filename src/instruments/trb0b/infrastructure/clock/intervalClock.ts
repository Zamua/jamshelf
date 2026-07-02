import type { Clock } from '../../application/ports';

// setInterval-backed Clock. Fires its subscribers once per tick at (60000 / bpm * beatsPerTick) ms.
// Re-arms on tempo / subdivision changes while running; idempotent start; SSR-safe (no timer until
// start). Accurate enough for a browser step sequencer; this is exactly the port the rig's shared
// transport will later implement instead, without touching the application.
export class IntervalClock implements Clock {
  private bpm = 120;
  private beatsPerTick = 0.25; // a 16th note (one step)
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
    if (this.timer !== null) return;
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

  private intervalMs(): number {
    return (60000 / this.bpm) * this.beatsPerTick;
  }
  private arm(): void {
    this.timer = setInterval(() => {
      for (const cb of this.subs) cb();
    }, this.intervalMs());
  }
  private rearm(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.arm();
  }
}
