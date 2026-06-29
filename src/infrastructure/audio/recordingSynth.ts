import type { PatchName, SynthPort } from '../../application/ports';
import type { Looper } from '../../application/looper';

// A transparent SynthPort decorator that captures every live note into the looper
// (when it is recording) and forwards to the real synth. This keeps recording out
// of the controller's play logic - the controller just plays; the looper records at
// the audio boundary. It tracks the current patch (via setPatch) so each captured
// event is tagged with the instrument it was played on. The looper's OWN playback
// talks to the real synth directly, so it is never re-recorded.
export class RecordingSynth implements SynthPort {
  private readonly inner: SynthPort;
  private readonly looper: Looper;
  private patch: PatchName = 'SAW';

  constructor(inner: SynthPort, looper: Looper) {
    this.inner = inner;
    this.looper = looper;
  }

  resume(): void {
    this.inner.resume();
  }
  noteOn(voiceId: string, freqs: number[], patch?: PatchName): void {
    this.looper.capture(true, voiceId, freqs, patch ?? this.patch);
    this.inner.noteOn(voiceId, freqs, patch);
  }
  noteOff(voiceId: string): void {
    this.looper.capture(false, voiceId, [], this.patch);
    this.inner.noteOff(voiceId);
  }
  releaseAll(): void {
    this.inner.releaseAll();
  }
  setPatch(patch: PatchName): void {
    this.patch = patch;
    this.inner.setPatch(patch);
  }
  setVolume(v: number): void {
    this.inner.setVolume(v);
  }
  setStrumMs(ms: number): void {
    this.inner.setStrumMs(ms);
  }
  setMuted(muted: boolean): void {
    this.inner.setMuted(muted);
  }
}
