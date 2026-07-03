import { useEffect, useMemo, useState } from 'react';
import { LoopStationController } from '../../application/loopStationController';
import type { ViewModel } from '../../application/state';
import { Transport } from '../../../../transport/transport';
import { IntervalTicker } from '../../../../transport/intervalTicker';
import type { DeviceHandlers } from '../deviceProps';

// React adapter for the LoopStationController: owns the controller, mirrors its ViewModel to React
// state, exposes DeviceHandlers. In a rig it slaves to the shared Transport; solo it spins its own
// ("solo is a rig of one"). Audio is not wired yet (first draft).
export function useLoopStation(_enabled = true, transport?: Transport) {
  const controller = useMemo(() => {
    const t = transport ?? new Transport();
    if (!transport) new IntervalTicker(t);
    return new LoopStationController(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);
  const [vm, setVm] = useState<ViewModel>(() => controller.getState());

  useEffect(() => controller.subscribe(setVm), [controller]);

  const handlers: DeviceHandlers = useMemo(
    () => ({
      resume: () => controller.resume(),
      onTrackButton: (track) => {
        controller.resume();
        controller.trackButton(track);
      },
      onTrackStop: (track) => controller.trackStop(track),
      onTrackClear: (track) => controller.trackClear(track),
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
