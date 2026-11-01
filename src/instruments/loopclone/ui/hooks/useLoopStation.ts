import { useEffect, useMemo, useState } from 'react';
import { LoopStationController } from '../../application/loopStationController';
import type { ViewModel } from '../../application/state';
import { Transport } from '../../../../transport/transport';
import { IntervalTicker } from '../../../../transport/intervalTicker';
import type { SharedAudio } from '../../../../rig/rigAudio';
import { IndexedDbLoopStore } from '../../infrastructure/persistence/indexedDbLoops';
import { LoopEngine } from '../../infrastructure/audio/loopEngine';
import { NullLoopEngine } from '../../application/loopEnginePort';
import type { DeviceHandlers } from '../deviceProps';

// React adapter for the LoopStationController: owns the controller, mirrors its ViewModel to React
// state, exposes DeviceHandlers. In a rig it slaves to the shared Transport; solo it spins its own
// ("solo is a rig of one"). With no shared audio graph (a shelf thumbnail) the engine is inert.
export function useLoopStation(_enabled = true, transport?: Transport, audio?: SharedAudio) {
  const controller = useMemo(() => {
    const t = transport ?? new Transport();
    if (!transport) new IntervalTicker(t);
    // loops persist to IndexedDB per instrument namespace
    const engine = audio
      ? new LoopEngine(audio.ctx, audio.looperInput, audio.loopOut, t, new IndexedDbLoopStore('loopclone'))
      : new NullLoopEngine();
    return new LoopStationController(t, engine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, audio]);
  const [vm, setVm] = useState<ViewModel>(() => controller.getState());

  useEffect(() => controller.subscribe(setVm), [controller]);
  useEffect(() => () => controller.dispose(), [controller]);

  const handlers: DeviceHandlers = useMemo(
    () => ({
      resume: () => controller.resume(),
      onTrackButton: (track) => {
        controller.resume();
        controller.trackButton(track);
      },
      onTrackStop: (track) => controller.trackStop(track),
      onTrackClear: (track) => controller.trackClear(track),
      onTrackSolo: (track) => controller.trackSolo(track),
      onUndo: () => controller.undoLast(),
      onRedo: () => controller.redoLast(),
      onTap: () => controller.tapTempo(performance.now()),
      onAllStop: () => controller.allStop(),
      onLevel: (track, level) => controller.setLevel(track, level),
      onPower: () => controller.togglePower(),
      onInspectToggle: () => controller.setInspect(!controller.getState().inspect),
      onHelpToggle: () => {
        // the manual is host-owned React state; the host patches this in
      },
    }),
    [controller],
  );

  return { vm, handlers };
}
