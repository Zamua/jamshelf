import type { InstrumentManifest } from '../../shared/instrument';

// The HiClone groovebox. The stage mounts its live device directly (see Stage.tsx); this
// is just the shelf-facing metadata.
export const hicloneManifest: InstrumentManifest = {
  id: 'hiclone',
  name: 'HiClone',
  blurb: '7-pad chord groovebox with a joystick morph + looper',
  hasMemory: true,
  accent: '#f0a93a', // the amber OLED glow
};
