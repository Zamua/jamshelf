import type { DrumMachinePort } from '../../application/ports';

// A no-op DrumMachinePort for tests / SSR / audio-disabled contexts.
export class NullDrums implements DrumMachinePort {
  resume(): void {}
  trigger(): void {}
  setVolume(): void {}
  setLevel(): void {}
  setMuted(): void {}
}
