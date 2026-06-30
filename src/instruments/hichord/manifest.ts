import { lazy } from 'react';
import type { InstrumentManifest } from '../../shared/instrument';
import Shelf3D from './Shelf3D';

// The HiClone groovebox. `Play` is lazy so the audio engine + full scene only load
// when you open /hichord; `Shelf3D` is the lightweight display model for the shelf.
export const hichordManifest: InstrumentManifest = {
  id: 'hichord',
  name: 'HiClone',
  blurb: '7-pad chord groovebox with a joystick morph + looper',
  hasMemory: true,
  Play: lazy(() => import('./Hichord')),
  Shelf3D,
  accent: '#f0a93a', // the amber OLED glow
};
