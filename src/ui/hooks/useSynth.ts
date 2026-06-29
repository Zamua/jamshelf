import { useEffect, useMemo, useRef, useState } from 'react';
import { SynthController } from '../../application/synthController';
import type { ViewModel } from '../../application/state';
import { WebAudioSynth } from '../../infrastructure/audio/webAudioSynth';
import { IntervalClock } from '../../infrastructure/clock/intervalClock';
import type { Degree, Quality } from '../../domain/music';
import type { DeviceHandlers } from '../three/deviceProps';

// Past this magnitude the joystick is considered "pushed"; inside it the stick
// is treated as centered (dead-zone). Generous, so the angle is only read once the
// push is clearly established (near-center the angle is jittery).
const JOY_DEADZONE = 0.42;
// Slightly larger gate for discrete menu flicks so the latch is unambiguous.
const MENU_NAV_THRESHOLD = 0.45;
// Each of the 8 directions only registers within +/- this many degrees of its
// center, leaving dead GAPS between directions. In a gap the previous quality is
// held (hysteresis), so dragging toward a diagonal never clips the neighbour.
const DIR_HALF_WIDTH = 17;

// The 8 compass directions (degrees, +y = up) and the chord quality each morphs to.
const DIRECTIONS: readonly [number, Quality][] = [
  [90, '7th'], // N
  [45, '9th'], // NE
  [0, 'sus4'], // E
  [315, 'sus2'], // SE
  [270, 'OPEN'], // S
  [225, 'add9'], // SW
  [180, '6th'], // W
  [135, 'JAZZ'], // NW
];

// Smallest absolute angle between two bearings, 0..180.
function angleGap(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// Map a joystick vector (x = right+, y = up+, magnitude 0..1) to a chord quality.
// Inside the dead-zone -> triad. Between two directions (a gap) -> hold `prev`, so
// a diagonal push does not briefly trigger the horizontal/vertical neighbour.
function joyQuality(x: number, y: number, prev: Quality): Quality {
  if (Math.hypot(x, y) < JOY_DEADZONE) return 'TRIAD';
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  let best: Quality | null = null;
  let bestGap = 999;
  for (const [center, quality] of DIRECTIONS) {
    const gap = angleGap(deg, center);
    if (gap < bestGap) {
      bestGap = gap;
      best = quality;
    }
  }
  return best !== null && bestGap <= DIR_HALF_WIDTH ? best : prev;
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
  const controller = useMemo(() => new SynthController(new WebAudioSynth(), new IntervalClock()), []);
  const [vm, setVm] = useState<ViewModel>(() => controller.getState());
  const menuLatched = useRef(false); // one nav step per flick out of the dead-zone
  const lastQuality = useRef<Quality>('TRIAD'); // for joystick direction hysteresis

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
    // Joystick while a menu is open: exactly ONE discrete step per flick. The
    // pitfalls a springy analog stick creates, and how this avoids them:
    //  - wobble re-triggering: we LATCH on a clear push and only unlatch once the
    //    stick is well back inside the centre (a much smaller radius than the push
    //    threshold = hysteresis), so a hovering finger can't flash a value back and
    //    forth.
    //  - up/down vs left/right confusion: we only act when ONE axis clearly
    //    dominates; a near-diagonal flick lands in an ambiguous band and does
    //    nothing, waiting for a cleaner flick.
    const MENU_RELEASE = 0.24; // unlatch radius (< MENU_NAV_THRESHOLD => hysteresis)
    const AXIS_DOMINANCE = 1.5; // one axis must beat the other by this factor
    const navMenu = (x: number, y: number) => {
      const mag = Math.hypot(x, y);
      if (mag < MENU_RELEASE) {
        menuLatched.current = false; // back near centre: ready for the next flick
        return;
      }
      if (menuLatched.current || mag < MENU_NAV_THRESHOLD) return;
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      if (ay > ax * AXIS_DOMINANCE) {
        menuLatched.current = true;
        controller.cursorField(y > 0 ? -1 : 1); // up/down picks the field
      } else if (ax > ay * AXIS_DOMINANCE) {
        menuLatched.current = true;
        controller.editValue(x > 0 ? 1 : -1); // left/right edits the value
      }
      // else: diagonal/ambiguous - wait for a clearer flick (no latch)
    };

    return {
      resume: () => controller.resume(),
      onPadDown: (id, degree) => controller.pressPad(id, degree),
      onPadMove: (id, degree) => controller.movePad(id, degree), // glissando
      onPadUp: (id) => controller.releasePad(id),
      onJoyMove: (x, y) => {
        // Menu open -> navigate fields/values; menu closed -> morph the held chord.
        if (controller.getState().menuOpen) navMenu(x, y);
        else {
          const q = joyQuality(x, y, lastQuality.current);
          lastQuality.current = q;
          controller.setQuality(q);
        }
      },
      onJoyEnd: () => {
        menuLatched.current = false;
        lastQuality.current = 'TRIAD';
        // Releasing the stick springs the held chord(s) back to a plain triad.
        if (!controller.getState().menuOpen) controller.springToTriad();
      },
      onKey: () => controller.toggleMenu('KEY'), // gray: key / scale / octave
      onSound: () => controller.cyclePatch(), // yellow: cycle the voice
      onTempo: () => controller.toggleMenu('MODE'), // red: play mode / rate / bpm
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
