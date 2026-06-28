import { useEffect, useMemo, useRef, useState } from 'react';
import { SynthController } from '../../application/synthController';
import type { ViewModel } from '../../application/state';
import { WebAudioSynth } from '../../infrastructure/audio/webAudioSynth';
import type { Degree, Quality } from '../../domain/music';
import type { DeviceHandlers } from '../three/deviceProps';

// Past this magnitude the joystick is considered "pushed"; inside it the stick
// is treated as centered (dead-zone) for both morph and menu navigation.
const JOY_DEADZONE = 0.34;
// Slightly larger gate for discrete menu flicks so the latch is unambiguous.
const MENU_NAV_THRESHOLD = 0.4;

// Map a joystick vector (x = right+, y = up+, magnitude 0..1) to a chord quality.
// Inside the dead-zone it is a plain triad.
function joyQuality(x: number, y: number): Quality {
  const dist = Math.hypot(x, y);
  if (dist < JOY_DEADZONE) return 'TRIAD';
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

// A digit key '1'..'7' -> its scale degree, anything else -> null.
function keyToDegree(key: string): Degree | null {
  if (key >= '1' && key <= '7') return Number(key) as Degree;
  return null;
}

// React adapter for the framework-agnostic SynthController: owns the controller
// instance, mirrors its ViewModel into React state, exposes DeviceHandlers, and
// adds desktop keyboard play. The glissando itself is delivered by the 3D pad
// meshes calling onPadMove -> controller.movePad; nothing here needs to know.
export function useSynth() {
  const controller = useMemo(() => new SynthController(new WebAudioSynth()), []);
  const [vm, setVm] = useState<ViewModel>(() => controller.getState());
  const menuLatched = useRef(false); // one nav step per flick out of the dead-zone

  useEffect(() => controller.subscribe(setVm), [controller]);

  // Desktop play: number keys 1..7 press/release the seven pads. The synthetic
  // voiceId ('k1'..'k7') keeps keyboard voices independent from touch voices, so
  // a chord can be held by keys and fingers at once. First keypress unlocks audio.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return; // ignore auto-repeat + shortcuts
      const degree = keyToDegree(e.key);
      if (degree === null) return;
      controller.resume();
      controller.pressPad('k' + degree, degree);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const degree = keyToDegree(e.key);
      if (degree === null) return;
      controller.releasePad('k' + degree);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [controller]);

  const handlers: DeviceHandlers = useMemo(() => {
    // Joystick while the gray menu is open: one discrete cursor move per flick.
    // We latch on the first out-of-dead-zone reading and unlatch only when the
    // stick returns to center, so a single push steps exactly once (not per
    // pointermove event). Up/down picks the field; left/right edits its value.
    const navMenu = (x: number, y: number) => {
      if (Math.hypot(x, y) < MENU_NAV_THRESHOLD) {
        menuLatched.current = false; // back in the dead-zone: ready for the next flick
        return;
      }
      if (menuLatched.current) return; // this flick already counted
      menuLatched.current = true;
      if (Math.abs(y) > Math.abs(x)) controller.cursorField(y > 0 ? -1 : 1);
      else controller.editValue(x > 0 ? 1 : -1);
    };

    return {
      resume: () => controller.resume(),
      onPadDown: (id, degree) => controller.pressPad(id, degree),
      onPadMove: (id, degree) => controller.movePad(id, degree), // glissando
      onPadUp: (id) => controller.releasePad(id),
      onJoyMove: (x, y) => {
        // Menu open -> navigate fields/values; menu closed -> morph the held chord.
        if (controller.getState().menuOpen) navMenu(x, y);
        else controller.setQuality(joyQuality(x, y));
      },
      onJoyEnd: () => {
        menuLatched.current = false;
        // Releasing the stick springs the held chord(s) back to a plain triad.
        if (!controller.getState().menuOpen) controller.springToTriad();
      },
      onKey: () => controller.toggleMenu(),
      onSound: () => controller.cyclePatch(),
      onTempo: () => controller.tapTempo(),
      onPower: () => controller.togglePower(),
      onVolume: (delta) => controller.nudgeVolume(delta),
      onInspectToggle: () => controller.setInspect(!controller.getState().inspect),
      onSwapColor: () => controller.swapColor(),
      onHelpToggle: () => {
        // The manual is UI-local React state; App owns it and overrides this.
      },
    };
  }, [controller]);

  return { vm, handlers };
}
