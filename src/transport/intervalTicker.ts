import { Transport, PPQN } from './transport';

const WAKE_MS = 12; // how often we wake to catch the transport up
const RESYNC_GAP = PPQN * 4; // if we fall more than a bar behind (tab backgrounded), re-anchor not catch up

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Drives a Transport in real time, SELF-CORRECTING to the wall clock: each wake it advances the
// transport to however many pulses SHOULD have elapsed since the anchor at the current tempo, rather
// than blindly advancing one pulse per fire. This matters because setInterval is throttled by
// main-thread work (React re-renders, the R3F render loop), so a naive one-pulse-per-tick clock
// runs SLOW and drifts against the sample-accurate audio (the looper's metronome + loops). Catching
// up keeps the average tempo exact. Re-anchors on tempo / running changes (transport.onChange, which
// never fires per pulse). SSR-safe; could later be upgraded to an AudioContext look-ahead scheduler
// for sample-accurate per-hit timing (this fixes the tempo; per-hit tightness is a separate step).
export class IntervalTicker {
  private readonly transport: Transport;
  private timer: ReturnType<typeof setInterval> | null = null;
  private anchorMs = 0; // wall time of the anchor
  private pulsesSinceAnchor = 0; // advances issued since the anchor

  constructor(transport: Transport) {
    this.transport = transport;
    transport.onChange(() => this.sync());
    this.sync();
  }

  // Match the timer to the transport, re-anchoring "now" at the current pulse + tempo.
  private sync(): void {
    this.clear();
    if (!this.transport.isAdvancing()) return;
    this.anchorMs = now();
    this.pulsesSinceAnchor = 0;
    this.timer = setInterval(() => this.tick(), WAKE_MS);
  }

  private tick(): void {
    const want = Math.floor((now() - this.anchorMs) / this.transport.intervalMs());
    const behind = want - this.pulsesSinceAnchor;
    if (behind > RESYNC_GAP) {
      // fell far behind (e.g. the tab was backgrounded) - jump forward without batch-firing every
      // intervening pulse (which would flam a bar of drum hits at once); re-anchor instead.
      this.anchorMs = now();
      this.pulsesSinceAnchor = 0;
      return;
    }
    for (let i = 0; i < behind; i++) {
      this.transport.advance();
      this.pulsesSinceAnchor++;
    }
  }

  private clear(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.clear();
  }
}
