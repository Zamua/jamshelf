import type { InstrumentModule } from '../../shared/instrument';
import { hicloneManifest } from './manifest';
import { useSynth } from './ui/hooks/useSynth';
import { Device } from './ui/three/Device';
import { Manual } from './ui/components/Manual';
import { BODY_THEMES } from './ui/three/palette';
import type { ViewModel } from './application/state';
import type { DeviceHandlers } from './ui/three/deviceProps';

// The HiClone's play-chrome extra: the shell-color swatch button (cycles the anodized edition).
function PlayTools({ vm, handlers }: { vm: ViewModel; handlers: DeviceHandlers }) {
  const theme = BODY_THEMES[vm.themeIndex % BODY_THEMES.length];
  return (
    <button
      className="tool-btn tool-swatch"
      onClick={handlers.onSwapColor}
      aria-label="Swap the device color"
      title={theme.name}
      style={{ background: theme.body }}
    />
  );
}

// The HiClone bundled as a jamshelf InstrumentModule: manifest + hook + device + chrome, all
// self-typed over its own VM / DeviceHandlers so the host can mount it without importing the
// instrument's internals.
export const hicloneModule: InstrumentModule<ViewModel, DeviceHandlers> = {
  manifest: hicloneManifest,
  useInstrument: (enabled) => useSynth(enabled),
  Device,
  Manual,
  releaseOnMiss: (handlers) => handlers.onJoyEnd(),
  withHelpToggle: (handlers, toggle) => ({ ...handlers, onHelpToggle: toggle }),
  PlayTools,
};
