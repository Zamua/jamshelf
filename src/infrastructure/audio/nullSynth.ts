import type { DrumName, DrumKit } from '../../domain/music';
import type { PatchName, SynthPort } from '../../application/ports';

// A no-op SynthPort for tests and SSR (no Web Audio side effects).
export class NullSynth implements SynthPort {
  resume(): void {}
  noteOn(_voiceId: string, _freqs: number[], _patch?: PatchName): void {}
  noteOff(_voiceId: string): void {}
  releaseAll(): void {}
  setPatch(_patch: PatchName): void {}
  setVolume(_v: number): void {}
  setStrumMs(_ms: number): void {}
  setMuted(_muted: boolean): void {}
  setBend(_cents: number): void {}
  setGlide(_seconds: number): void {}
  drum(_name: DrumName, _kit: DrumKit): void {}
  setFx(_delay: boolean, _chorus: boolean, _delayMs: number): void {}
}
