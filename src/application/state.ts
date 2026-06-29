import type { Degree, Quality, ScaleName, PitchClass, PlayMode } from '../domain/music';
import type { PatchName } from './ports';

// Which menu is open: the gray KEY menu or the red MODE menu.
export type MenuKind = 'KEY' | 'MODE';

// One editable field of the open menu, rendered by the 2D hint + (compactly) the
// OLED. The controller is the single source for the label/value, so views never
// re-derive menu state.
export interface MenuFieldView {
  readonly label: string;
  readonly value: string;
  readonly active: boolean;
}

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
  // index into the shell-color editions (the UI maps it to actual colors); the
  // controller just cycles it, keeping presentation colors out of the app layer.
  readonly themeIndex: number;
  // the active play mode (PLAY / STRUM / ARP / DRONE / REPEAT / LEAD).
  readonly mode: PlayMode;
  readonly menuOpen: boolean;
  readonly menuKind: MenuKind;
  readonly menuField: string; // active field label while a menu is open, else ''
  readonly menuFields: readonly MenuFieldView[]; // the open menu's fields, else []
  // pads currently held/lit (by degree), for visual press state.
  readonly litPads: readonly Degree[];
  // OLED lines.
  readonly screenBig: string; // key+scale, a flashed name, or the live menu
  readonly screenSmall: string; // patch + mode, or the menu's other fields
}

export type Listener = (vm: ViewModel) => void;
