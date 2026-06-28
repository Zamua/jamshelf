import type { Degree, Quality, ScaleName, PitchClass } from '../domain/music';
import type { PatchName } from './ports';

// The menu field the gray Key menu cursor is on.
export type MenuField = 'KEY' | 'SCL' | 'OCT';

// The full observable view-model the UI (2D overlays + the 3D device) renders.
// Kept plain + serializable so any view can consume it.
export interface ViewModel {
  readonly root: PitchClass;
  readonly scale: ScaleName;
  readonly octave: number;
  readonly quality: Quality;
  readonly patch: PatchName;
  readonly bpm: number;
  readonly volume: number; // 0..1
  readonly power: boolean;
  readonly inspect: boolean;
  readonly menuOpen: boolean;
  readonly menuField: MenuField;
  // pads currently held/lit (by degree), for visual press state.
  readonly litPads: readonly Degree[];
  // OLED lines.
  readonly screenBig: string; // key+scale, or a flashed chord/quality name
  readonly screenSmall: string; // patch + bpm
}

export type Listener = (vm: ViewModel) => void;
