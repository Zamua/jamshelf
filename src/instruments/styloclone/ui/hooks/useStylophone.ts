import { useEffect, useMemo, useRef, useState } from 'react';
import { StylophoneController } from '../../application/stylophoneController';
import type { ViewModel } from '../../application/state';
import { WebAudioStylophone } from '../../infrastructure/audio/webAudioStylophone';
import { LocalStorageStylophoneSettings } from '../../infrastructure/persistence/localStorageStylophoneSettings';
import { KEYS, keyRow, type Midi } from '../../domain/keyboard';
import type { DeviceHandlers } from '../deviceProps';

// Desktop keyboard -> the 20 keys. Naturals map to the QWERTY letter row, accidentals to the
// number row above (piano-ish: black keys above white). Built by walking KEYS in pitch order.
const NATURAL_ROW = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'];
const ACCIDENTAL_ROW = ['1', '2', '3', '4', '5', '6', '7', '8'];
const KEY_FOR_CHAR: Record<string, Midi> = (() => {
  const map: Record<string, Midi> = {};
  let n = 0;
  let a = 0;
  for (const midi of KEYS) {
    if (keyRow(midi) === 'natural') {
      if (n < NATURAL_ROW.length) map[NATURAL_ROW[n++]] = midi;
    } else {
      if (a < ACCIDENTAL_ROW.length) map[ACCIDENTAL_ROW[a++]] = midi;
    }
  }
  return map;
})();

// React adapter for the framework-agnostic StylophoneController: owns the controller,
// mirrors its ViewModel into React state, exposes DeviceHandlers, and adds desktop keyboard
// play with mono last-note priority. The device (3D keyboard plate) delivers touch/mouse play
// by calling onKeyDown/onKeyUp; nothing here needs to know how.
export function useStylophone(enabled = true) {
  const controller = useMemo(() => {
    const synth = new WebAudioStylophone();
    const ns = 'styloclone';
    return new StylophoneController(synth, new LocalStorageStylophoneSettings(ns));
  }, []);
  const [vm, setVm] = useState<ViewModel>(() => controller.getState());

  useEffect(() => controller.subscribe(setVm), [controller]);

  // Stuck-note guard: a key's pointer-up is raycast-delivered, so a stylus lifting off the
  // EDGE of a key or in a gap leaves the voice held with no release. The browser always fires
  // a window pointerup/pointercancel, so release from there too. Idempotent (a normal release
  // already cleared the voice; mono, so no per-pointer bookkeeping needed).
  useEffect(() => {
    const release = () => controller.releaseKey();
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [controller]);

  // Desktop play with MONO last-note priority: track the stack of held keyboard notes; a new
  // press sounds it; releasing the sounding note falls back to the most-recent still-held key
  // (or silence). Matches the hardware's single-voice behavior.
  const heldChars = useRef<string[]>([]);
  useEffect(() => {
    if (!enabled) return; // only the ACTIVE instrument responds to the desktop keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const midi = KEY_FOR_CHAR[e.key.toLowerCase()];
      if (midi === undefined) return;
      controller.resume();
      const ch = e.key.toLowerCase();
      if (!heldChars.current.includes(ch)) heldChars.current.push(ch);
      controller.pressKey(midi);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const ch = e.key.toLowerCase();
      const midi = KEY_FOR_CHAR[ch];
      if (midi === undefined) return;
      heldChars.current = heldChars.current.filter((c) => c !== ch);
      const next = heldChars.current[heldChars.current.length - 1];
      if (next !== undefined) controller.pressKey(KEY_FOR_CHAR[next]);
      else controller.releaseKey();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [controller, enabled]);

  const handlers: DeviceHandlers = useMemo(
    () => ({
      resume: () => controller.resume(),
      onKeyDown: (midi) => controller.pressKey(midi),
      onKeyUp: () => controller.releaseKey(),
      onVibratoToggle: () => controller.toggleVibrato(),
      onVoiceCycle: () => controller.nextVoice(),
      onTune: (cents) => controller.setTune(cents),
      onVolume: (v) => controller.setVolume(v),
      onPower: () => controller.togglePower(),
      onInspectToggle: () => controller.setInspect(!controller.getState().inspect),
      onHelpToggle: () => {
        // The manual is UI-local React state; the host owns it and overrides this.
      },
    }),
    [controller],
  );

  return { vm, handlers };
}
