import type { InstrumentModule } from '../../shared/instrument';
import { loopcloneManifest } from './manifest';
import { useLoopStation } from './ui/hooks/useLoopStation';
import { Device } from './ui/three/Device';
import type { ViewModel } from './application/state';
import type { DeviceHandlers } from './ui/deviceProps';

// The LoopClone bundled as a jamshelf InstrumentModule. First draft: the device + its track state
// machine; the audio (record/route/play) is a later iteration.
export const loopcloneModule: InstrumentModule<ViewModel, DeviceHandlers> = {
  manifest: loopcloneManifest,
  useInstrument: (enabled, transport, audio) => useLoopStation(enabled, transport, audio),
  Device,
  releaseOnMiss: () => {}, // a tap on empty space does nothing (track states latch)
  withHelpToggle: (handlers, toggle) => ({ ...handlers, onHelpToggle: toggle }),
};
