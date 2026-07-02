import { useEffect, useMemo, useState } from 'react';
import { DrumMachineController } from '../../application/drumMachineController';
import type { ViewModel } from '../../application/state';
import { WebAudioDrums } from '../../infrastructure/audio/webAudioDrums';
import { IntervalClock } from '../../infrastructure/clock/intervalClock';
import { LocalStorageDrumSettings } from '../../infrastructure/persistence/localStorageDrumSettings';
import { VOICES, STEPS } from '../../domain/sequencer';
import type { DeviceHandlers } from '../deviceProps';

// React adapter for the framework-agnostic DrumMachineController: owns the controller, mirrors its
// ViewModel into React state, exposes DeviceHandlers, and adds desktop keys. Space = play/stop,
// digits 1-8 pick a voice, and the space is left for the step buttons on the device.
export function useDrumMachine(enabled = true) {
  const controller = useMemo(() => {
    const synth = new WebAudioDrums();
    const ns = 'trb0b';
    return new DrumMachineController(synth, new IntervalClock(), new LocalStorageDrumSettings(ns));
  }, []);
  const [vm, setVm] = useState<ViewModel>(() => controller.getState());

  useEffect(() => controller.subscribe(setVm), [controller]);

  // Desktop keys (only for the active instrument): space toggles play/stop; 1-8 select a voice.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        controller.resume();
        controller.togglePlay();
      } else if (e.key >= '1' && e.key <= '8') {
        const i = Number(e.key) - 1;
        if (i < VOICES.length) controller.selectVoice(VOICES[i]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, enabled]);

  const handlers: DeviceHandlers = useMemo(
    () => ({
      resume: () => controller.resume(),
      onStepToggle: (step) => {
        controller.resume();
        if (step >= 0 && step < STEPS) controller.toggleStep(step);
      },
      onVoiceSelect: (voice) => controller.selectVoice(voice),
      onLevel: (voice, level) => controller.setLevel(voice, level),
      onPlayStop: () => {
        controller.resume();
        controller.togglePlay();
      },
      onTempo: (bpm) => controller.setBpm(bpm),
      onClear: () => controller.clearSelected(),
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
