import { Transport } from '../../../transport/transport';
import { emptyTrack, nextOnButton, onStop, TRACK_COUNT, type Track } from '../domain/loopStation';
import type { Listener, ViewModel } from './state';

// Framework-agnostic application service for the LoopClone. Owns the 5 tracks + their faders, mirrors
// the shared Transport's tempo/run state into the ViewModel, and exposes the operations the device
// fires. FIRST DRAFT: state + visuals only - the audio adapter (record/route/play) lands next.
export class LoopStationController {
  private tracks: Track[] = Array.from({ length: TRACK_COUNT }, emptyTrack);
  private power = true;
  private inspect = false;
  private readonly listeners = new Set<Listener>();
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
    this.transport.onChange(() => this.publish()); // reflect tempo / play state on the top panel
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => this.listeners.delete(cb);
  }

  getState(): ViewModel {
    return {
      power: this.power,
      tracks: this.tracks.map((t) => ({ state: t.state, level: t.level })),
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
    // audio wiring lands in a later iteration; nothing to resume yet
  }

  trackButton(i: number): void {
    if (!this.power || i < 0 || i >= TRACK_COUNT) return;
    this.tracks[i] = { ...this.tracks[i], state: nextOnButton(this.tracks[i].state) };
    this.publish();
  }

  trackStop(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.tracks[i] = { ...this.tracks[i], state: onStop(this.tracks[i].state) };
    this.publish();
  }

  trackClear(i: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.tracks[i] = emptyTrack();
    this.publish();
  }

  setLevel(i: number, level: number): void {
    if (i < 0 || i >= TRACK_COUNT) return;
    this.tracks[i] = { ...this.tracks[i], level: Math.max(0, Math.min(1, level)) };
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
}
