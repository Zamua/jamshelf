import { Transport } from './transport';

// The I/O adapter that drives a Transport in real time: a setInterval that calls transport.advance()
// once per pulse-interval while the transport is running. Re-arms when the tempo or running state
// changes (subscribed via transport.onChange, which fires only on those structural changes - never
// per pulse). SSR-safe (no timer until the transport plays). Could be swapped for an AudioContext
// look-ahead scheduler later without touching the Transport or the instruments.
export class IntervalTicker {
  private readonly transport: Transport;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(transport: Transport) {
    this.transport = transport;
    transport.onChange(() => this.sync());
    this.sync();
  }

  // Match the timer to the transport's current running + tempo.
  private sync(): void {
    const shouldRun = this.transport.isRunning();
    if (!shouldRun) {
      this.clear();
      return;
    }
    // running: (re)arm at the current pulse interval
    this.clear();
    this.timer = setInterval(() => this.transport.advance(), this.transport.intervalMs());
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
