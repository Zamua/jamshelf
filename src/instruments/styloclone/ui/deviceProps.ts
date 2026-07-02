import type { Midi } from '../domain/keyboard';
import type { ViewModel } from '../application/state';

// Input events the 3D StyloClone device emits. The device is purely presentational: it
// renders the ViewModel and fires raw, semantic-free input here. All musical interpretation
// (monophonic retrigger, power gating, persistence) lives in the controller, so the 3D lane
// and the logic lane stay decoupled - the same discipline as the HiClone's DeviceHandlers.
export interface DeviceHandlers {
  // unlock audio on the first user gesture
  resume(): void;
  // the stylus touched a key (MIDI note). Fired on pointer-down over a key AND when the
  // stylus is dragged onto a new key (the slur) - the controller de-dupes same-key repeats.
  onKeyDown(midi: Midi): void;
  // the stylus lifted off the keyboard
  onKeyUp(): void;
  // the front controls
  onVibratoToggle(): void; // the vibrato switch
  onVoiceCycle(): void; // the sound selector
  onTune(cents: number): void; // the tune pot (absolute cents)
  onVolume(v: number): void; // the volume pot (absolute 0..1)
  onPower(): void; // the power switch
  // chassis / meta (shared shelf chrome)
  onInspectToggle(): void;
  onHelpToggle(): void;
}

export interface DeviceProps {
  vm: ViewModel;
  handlers: DeviceHandlers;
}
