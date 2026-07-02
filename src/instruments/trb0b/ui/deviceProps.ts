import type { DrumVoice } from '../domain/sequencer';
import type { ViewModel } from '../application/state';

// Input events the 3D TR-B0B emits. The device is purely presentational: it renders the ViewModel
// and fires raw, semantic-free input here. All sequencing logic lives in the controller.
export interface DeviceHandlers {
  resume(): void;
  onStepToggle(step: number): void; // tap a step button -> toggle it for the selected voice
  onVoiceSelect(voice: DrumVoice): void; // pick which voice the step buttons program
  onLevel(voice: DrumVoice, level: number): void; // the per-voice LEVEL knob (absolute 0..1)
  onPlayStop(): void; // START/STOP
  onTempo(bpm: number): void; // the tempo knob (absolute bpm)
  onClear(): void; // clear the selected voice's row
  onPower(): void;
  onInspectToggle(): void;
  onHelpToggle(): void;
}

export interface DeviceProps {
  vm: ViewModel;
  handlers: DeviceHandlers;
}
