import type { ViewModel } from '../application/state';

// Raw input the 3D LoopClone emits. Presentational device: renders the ViewModel, fires semantic-
// free events here; all looping logic lives in the controller.
export interface DeviceHandlers {
  resume(): void;
  onTrackButton(track: number): void; // the big round record/play button
  onTrackStop(track: number): void; // the stop button
  onTrackClear(track: number): void; // hold-stop: empty the track
  onLevel(track: number, level: number): void; // the track fader (absolute 0..1)
  onPower(): void;
  onInspectToggle(): void;
  onHelpToggle(): void;
}

export interface DeviceProps {
  vm: ViewModel;
  handlers: DeviceHandlers;
}
