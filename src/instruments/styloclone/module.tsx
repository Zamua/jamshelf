import type { InstrumentModule } from '../../shared/instrument';
import { stylocloneManifest } from './manifest';
import { useStylophone } from './ui/hooks/useStylophone';
import { Device } from './ui/three/Device';
import { Manual } from './ui/components/Manual';
import type { ViewModel } from './application/state';
import type { DeviceHandlers } from './ui/deviceProps';

// The StyloClone bundled as a jamshelf InstrumentModule. No color-swap chrome (it has a single
// faithful cream shell), so no PlayTools.
export const stylocloneModule: InstrumentModule<ViewModel, DeviceHandlers> = {
  manifest: stylocloneManifest,
  useInstrument: (enabled) => useStylophone(enabled),
  Device,
  Manual,
  releaseOnMiss: (handlers) => handlers.onKeyUp(),
  withHelpToggle: (handlers, toggle) => ({ ...handlers, onHelpToggle: toggle }),
};
