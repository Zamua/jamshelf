import type { Ticker } from '../../application/ports';

// requestAnimationFrame-backed Ticker. Fires the callback once per frame with the
// RAF timestamp (ms since page load), which the looper uses as its timeline.
export class RafTicker implements Ticker {
  private raf = 0;

  start(cb: (nowMs: number) => void): void {
    this.stop();
    const loop = (t: number) => {
      cb(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }
}
