import type { StylophonePort } from '../../application/ports';

// A no-op StylophonePort for tests / SSR / audio-disabled contexts. Implements the port
// without touching Web Audio, so the controller can run anywhere.
export class NullStylophone implements StylophonePort {
  resume(): void {}
  noteOn(): void {}
  noteOff(): void {}
  setVibrato(): void {}
  setTune(): void {}
  setVolume(): void {}
  setVoice(): void {}
  setMuted(): void {}
}
