import type { ViewModel } from '../application/state';

// Raw input the 3D LoopClone emits. Presentational device: renders the ViewModel, fires semantic-
// free events here; all looping logic lives in the controller.
export interface DeviceHandlers {
  resume(): void;
  onTrackButton(track: number): void; // the big round record/play/overdub button
  onTrackStop(track: number): void; // the stop button: mute (loop keeps running)
  onTrackClear(track: number): void; // hold-stop: empty the track
  onTrackSolo(track: number): void; // long-press the big button: solo (mute the others)
  onUndo(): void; // UNDO (top panel): revert the last take on the last-touched track
  onRedo(): void; // hold UNDO: redo
  onTap(): void; // TAP: tap tempo
  onAllStop(): void; // ALL: start/stop every loop at once
  onLevel(track: number, level: number): void; // the track fader (absolute 0..1)
  onPower(): void;
  onInspectToggle(): void;
  onHelpToggle(): void;
}

export interface DeviceProps {
  vm: ViewModel;
  handlers: DeviceHandlers;
}
