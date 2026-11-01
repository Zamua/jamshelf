import type { Transport } from '../../../transport/transport';
import { TRACK_COUNT } from '../domain/loopStation';
import type { LoopEnginePort } from './loopEnginePort';
import type { Listener, ViewModel } from './state';

// Framework-agnostic application service for the LoopClone. Drives the loop engine (record per-track
// loops, play them back, mute/solo/fader/undo) and mirrors the shared Transport's tempo/run state
// into the ViewModel.
export class LoopStationController {
  private readonly engine: LoopEnginePort;
  private power = true;
  private inspect = false;
  private lastTouched = 0; // the track the top-panel UNDO acts on (the one you last recorded/dubbed)
  private tapTimes: number[] = []; // recent TAP presses (ms), for tap-tempo
  private readonly listeners = new Set<Listener>();
  private readonly transport: Transport;

  constructor(transport: Transport, engine: LoopEnginePort) {
    this.transport = transport;
    this.engine = engine;
    this.transport.onChange(() => this.publish()); // reflect tempo / play state on the top panel
    this.engine.onChange(() => this.publish());
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => this.listeners.delete(cb);
  }

  getState(): ViewModel {
    const tracks = this.engine.view().map((t, i) => ({ ...t, canUndo: this.engine.canUndo(i) }));
    return {
      power: this.power,
      tracks,
      bpm: this.transport.getBpm(),
      playing: this.transport.isRunning(),
      inspect: this.inspect,
    };
  }

  private publish(): void {
    const vm = this.getState();
    for (const cb of this.listeners) cb(vm);
  }

  resume(): void {
    // the shared AudioContext is resumed by the instruments' own gesture handlers; nothing extra here.
  }

  // --- the big round button: record -> play -> overdub cycle (or resume a stopped track) ---
  trackButton(i: number): void {
    if (!this.power || i < 0 || i >= TRACK_COUNT) return;
    this.lastTouched = i;
    this.engine.button(i);
    this.publish();
  }

  // stop button: MUTE the track (its loop keeps running, silenced, so unmute is in-phase)
  trackStop(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.engine.stop(i);
    this.publish();
  }

  // hold stop: clear the track
  trackClear(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.engine.clear(i);
    this.publish();
  }

  // long-press: solo (mute the others)
  trackSolo(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.engine.solo(i);
    this.publish();
  }

  // UNDO (top panel): revert the last take on the track you last recorded/overdubbed.
  undoLast(): void {
    this.engine.undo(this.lastTouched);
    this.publish();
  }
  // hold UNDO: redo it.
  redoLast(): void {
    this.engine.redo(this.lastTouched);
    this.publish();
  }

  // TAP: tap tempo. The average of the recent tap intervals sets the shared BPM (transport clamps it).
  tapTempo(now: number): void {
    const last = this.tapTimes[this.tapTimes.length - 1];
    if (last !== undefined && now - last > 2000) this.tapTimes = []; // long gap -> start a fresh count
    this.tapTimes.push(now);
    if (this.tapTimes.length > 4) this.tapTimes.shift();
    if (this.tapTimes.length >= 2) {
      let sum = 0;
      for (let i = 1; i < this.tapTimes.length; i++) sum += this.tapTimes[i] - this.tapTimes[i - 1];
      const avg = sum / (this.tapTimes.length - 1);
      if (avg > 0) this.transport.setBpm(Math.round(60000 / avg));
    }
    this.publish();
  }

  // ALL: start/stop every loop at once
  allStop(): void {
    this.engine.allStop();
    this.publish();
  }

  setLevel(i: number, level: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.engine.setLevel(i, Math.max(0, Math.min(1, level)));
    this.publish();
  }

  togglePower(): void {
    this.power = !this.power;
    this.publish();
  }

  setInspect(on: boolean): void {
    this.inspect = on;
    this.publish();
  }

  dispose(): void {
    this.engine.dispose();
  }
}
