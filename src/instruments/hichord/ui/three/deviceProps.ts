import type { Degree } from '../../domain/music';
import type { ViewModel } from '../../application/state';

// Input events the 3D device emits. The device is purely presentational: it
// renders the ViewModel and fires raw, semantic-free input here. All musical
// interpretation (menu vs morph, glissando, etc.) lives in the controller, so
// the 3D lane and the logic lane stay decoupled.
export interface DeviceHandlers {
  // unlock audio on the first user gesture
  resume(): void;
  // pads (multi-touch): pointerId is a stable per-finger key
  onPadDown(pointerId: string, degree: Degree): void;
  onPadMove(pointerId: string, degree: Degree): void; // finger slid onto another pad
  onPadUp(pointerId: string): void;
  // joystick: dir components in -1..1 (x = left/right, y = up/down, +y = up).
  // The controller maps this to a quality morph (menu closed) or menu nav (open).
  onJoyMove(x: number, y: number): void;
  onJoyEnd(): void;
  // joystick CLICK (tap, no drag) + long-press: drive the looper (record / overdub
  // / clear), like the device's joystick click.
  onJoyClick(): void;
  onJoyHold(): void;
  // colored menu buttons
  onKey(): void; // gray
  onSound(): void; // yellow
  onTempo(): void; // red
  // chassis / meta
  onPower(): void;
  onVolume(delta: number): void;
  onInspectToggle(): void;
  onHelpToggle(): void;
  onSwapColor(): void; // cycle the shell-color edition
}

export interface DeviceProps {
  vm: ViewModel;
  handlers: DeviceHandlers;
}
