import { useEffect, useMemo, useRef, useState } from 'react';
import { SynthController } from '../../application/synthController';
import type { ViewModel } from '../../application/state';
import { WebAudioSynth } from '../../infrastructure/audio/webAudioSynth';
import { IntervalClock } from '../../infrastructure/clock/intervalClock';
import type { Degree, Quality } from '../../domain/music';
import type { DeviceHandlers } from '../three/deviceProps';

// The joystick only registers a direction when pushed almost FULLY to it, and only
// disengages once it springs most of the way back. Two thresholds (engage high,
// release low) give magnitude hysteresis so a finger hovering near the edge can't
// flicker the morph on and off - the single biggest source of "twitchy" feel.
const JOY_ENGAGE = 0.85; // must be this far out (0..1) to start morphing
const JOY_RELEASE = 0.5; // and fall back inside this to return to a plain triad
// Discrete menu flicks need an equally clear, near-full push.
const MENU_NAV_THRESHOLD = 0.85;
// Each of the 8 directions only registers within +/- this many degrees of its
// center, leaving wide dead GAPS between directions. In a gap the previous quality
// is held (hysteresis), so a diagonal pull never clips the horizontal/vertical
// neighbour. 12 deg half-width => 24 deg live sectors, 21 deg dead gaps.
const DIR_HALF_WIDTH = 12;

// The 8 compass directions (degrees, +y = up) and the chord quality each morphs
// to - the real device's DEFAULT joystick layout.
const DIRECTIONS: readonly [number, Quality][] = [
  [90, 'FLIP'], // up: flip maj <-> min
  [45, 'DOM7'], // up-right: dominant 7th
  [0, '7th'], // right: natural 7th (maj7 / min7)
  [315, '9th'], // down-right: add 9th
  [270, 'sus4'], // down: suspended 4th
  [225, '6th'], // down-left: add 6th
  [180, 'DIM'], // left: diminished
  [135, 'AUG'], // up-left: augmented
];

// Smallest absolute angle between two bearings, 0..180.
function angleGap(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// Map a joystick vector (x = right+, y = up+, magnitude 0..1) to a chord quality,
// given the PREVIOUS quality (for hysteresis). Magnitude hysteresis: engage only
// past JOY_ENGAGE, disengage only below JOY_RELEASE. Angular hysteresis: in a gap
// between two directions, hold `prev` rather than snapping. Together this kills the
// boundary flicker and stops a diagonal pull from clipping its neighbour.
function joyQuality(x: number, y: number, prev: Quality): Quality {
  const mag = Math.hypot(x, y);
  // Once morphing, you must spring most of the way back to drop to a triad; if not
  // yet morphing, you must push nearly fully out to start.
  if (mag < (prev === 'TRIAD' ? JOY_ENGAGE : JOY_RELEASE)) return 'TRIAD';
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
    const MENU_RELEASE = 0.4; // unlatch radius (< MENU_NAV_THRESHOLD => hysteresis)
    const AXIS_DOMINANCE = 1.6; // one axis must beat the other by this factor
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
