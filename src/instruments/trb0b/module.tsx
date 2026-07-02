import type { InstrumentModule } from '../../shared/instrument';
import { trb0bManifest } from './manifest';
import { useDrumMachine } from './ui/hooks/useDrumMachine';
import { Device } from './ui/three/Device';
import { Manual } from './ui/components/Manual';
import type { ViewModel } from './application/state';
import type { DeviceHandlers } from './ui/deviceProps';

// The TR-B0B bundled as a jamshelf InstrumentModule. No color-swap chrome (single faithful shell).
export const trb0bModule: InstrumentModule<ViewModel, DeviceHandlers> = {
  manifest: trb0bManifest,
  useInstrument: (enabled) => useDrumMachine(enabled),
  Device,
  Manual,
  releaseOnMiss: () => {}, // a tap on empty space does nothing (steps latch)
  withHelpToggle: (handlers, toggle) => ({ ...handlers, onHelpToggle: toggle }),
};
