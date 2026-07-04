import { Transport } from '../../../transport/transport';
import type { SharedAudio } from '../../../rig/rigAudio';
import { emptyTrack, nextOnButton, onStop, TRACK_COUNT, type Track } from '../domain/loopStation';
import { LoopEngine } from '../infrastructure/audio/loopEngine';
import type { LoopStore } from './persistence';
import type { Listener, ViewModel } from './state';

// Framework-agnostic application service for the LoopClone. Owns the LoopEngine (the audio: tap the
// rig's input bus, record per-track loops, play them back, mute/solo/fader/undo) and mirrors the
// shared Transport's tempo/run state into the ViewModel. When no shared audio is available (unit
// tests, a thumbnail render) it degrades to the pure domain state machine with no sound.
export class LoopStationController {
  private readonly engine: LoopEngine | null;
  private power = true;
  private inspect = false;
  private lastTouched = 0; // the track the top-panel UNDO acts on (the one you last recorded/dubbed)
  private tapTimes: number[] = []; // recent TAP presses (ms), for tap-tempo
  private readonly listeners = new Set<Listener>();
  private readonly transport: Transport;
  // fallback track state used only when there is no engine (no audio)
  private tracks: Track[] = Array.from({ length: TRACK_COUNT }, emptyTrack);

  constructor(transport: Transport, audio?: SharedAudio, store?: LoopStore) {
    this.transport = transport;
    this.transport.onChange(() => this.publish()); // reflect tempo / play state on the top panel
    this.engine = audio ? new LoopEngine(audio.ctx, audio.looperInput, audio.loopOut, transport, () => this.publish(), store) : null;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => this.listeners.delete(cb);
  }

  getState(): ViewModel {
    const tracks = this.engine
      ? this.engine.view().map((t, i) => ({ state: t.state, level: t.level, muted: t.muted, soloed: t.soloed, canUndo: this.engine!.canUndo(i) }))
      : this.tracks.map((t) => ({ state: t.state, level: t.level, muted: false, soloed: false, canUndo: false }));
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
    if (this.engine) this.engine.button(i);
    else this.tracks[i] = { ...this.tracks[i], state: nextOnButton(this.tracks[i].state) };
    this.publish();
  }

  // stop button: MUTE the track (its loop keeps running, silenced, so unmute is in-phase)
  trackStop(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    if (this.engine) this.engine.stop(i);
    else this.tracks[i] = { ...this.tracks[i], state: onStop(this.tracks[i].state) };
    this.publish();
  }

  // hold stop: clear the track
  trackClear(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    if (this.engine) this.engine.clear(i);
    else this.tracks[i] = emptyTrack();
    this.publish();
  }

  // long-press: solo (mute the others)
  trackSolo(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.engine?.solo(i);
    this.publish();
  }

  // UNDO (top panel): revert the last take on the track you last recorded/overdubbed.
  undoLast(): void {
    this.engine?.undo(this.lastTouched);
    this.publish();
  }
  // hold UNDO: redo it.
  redoLast(): void {
    this.engine?.redo(this.lastTouched);
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
    this.engine?.allStop();
    this.publish();
  }

  setLevel(i: number, level: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    const v = Math.max(0, Math.min(1, level));
    if (this.engine) this.engine.setLevel(i, v);
    else this.tracks[i] = { ...this.tracks[i], level: v };
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
    this.engine?.dispose();
  }
}
