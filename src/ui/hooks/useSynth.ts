import { useEffect, useMemo, useRef, useState } from 'react';
import { SynthController } from '../../application/synthController';
import type { ViewModel } from '../../application/state';
import { WebAudioSynth } from '../../infrastructure/audio/webAudioSynth';
import type { Quality } from '../../domain/music';
import type { DeviceHandlers } from '../three/deviceProps';

// Map a joystick vector (x = right+, y = up+, magnitude 0..1) to a chord quality.
// Inside a dead-zone it is a plain triad.
function joyQuality(x: number, y: number): Quality {
  const dist = Math.hypot(x, y);
  if (dist < 0.34) return 'TRIAD';
  const deg = (Math.atan2(y, x) * 180) / Math.PI; // -180..180, +y = up
  const snapped = ((Math.round(deg / 45) * 45) + 360) % 360;
  switch (snapped) {
    case 90:
      return '7th'; // N
    case 45:
      return '9th'; // NE
    case 0:
      return 'sus4'; // E
    case 315:
      return 'sus2'; // SE
    case 270:
      return 'OPEN'; // S
    case 225:
      return 'add9'; // SW
    case 180:
      return '6th'; // W
    case 135:
      return 'JAZZ'; // NW
    default:
      return 'TRIAD';
  }
}

// React adapter for the framework-agnostic SynthController: owns the controller
// instance, mirrors its ViewModel into React state, and exposes DeviceHandlers.
// The UI lane extends this (menu-nav debounce, glissando slide detection, etc.).
export function useSynth() {
  const controller = useMemo(() => new SynthController(new WebAudioSynth()), []);
  const [vm, setVm] = useState<ViewModel>(() => controller.getState());
  const menuStep = useRef(0); // debounce menu nav flicks

  useEffect(() => controller.subscribe(setVm), [controller]);

  const handlers: DeviceHandlers = useMemo(
    () => ({
      resume: () => controller.resume(),
      onPadDown: (id, degree) => controller.pressPad(id, degree),
      onPadMove: (id, degree) => controller.movePad(id, degree),
      onPadUp: (id) => controller.releasePad(id),
      onJoyMove: (x, y) => {
        if (controller.getState().menuOpen) {
          // discrete one-step nav per flick out of the dead-zone
          const mag = Math.hypot(x, y);
          if (mag < 0.4) {
            menuStep.current = 0;
            return;
          }
          if (menuStep.current) return;
          menuStep.current = 1;
          if (Math.abs(y) > Math.abs(x)) controller.cursorField(y > 0 ? -1 : 1);
          else controller.editValue(x > 0 ? 1 : -1);
        } else {
          controller.setQuality(joyQuality(x, y));
        }
      },
      onJoyEnd: () => {
        menuStep.current = 0;
        if (!controller.getState().menuOpen) controller.springToTriad();
      },
      onKey: () => controller.toggleMenu(),
      onSound: () => controller.cyclePatch(),
      onTempo: () => controller.tapTempo(),
      onPower: () => controller.togglePower(),
      onVolume: (delta) => controller.nudgeVolume(delta),
      onInspectToggle: () => controller.setInspect(!controller.getState().inspect),
      onHelpToggle: () => {
        /* help overlay is UI-local state; wired in the UI lane */
      },
    }),
    [controller],
  );

  return { vm, handlers };
}
