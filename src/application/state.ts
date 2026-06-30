import type { Degree, Quality, ScaleName, PitchClass, PlayMode } from '../domain/music';
import type { PatchName, LooperView } from './ports';

// Which menu is open: the gray KEY menu or the red MODE menu.
export type MenuKind = 'KEY' | 'MODE';

// One row of the OLED menu (label + current value + whether the cursor is on it).
// The UI lays these out as a fitted vertical list, so the row count never overflows
// the screen the way newline-wrapped text did.
export interface MenuRow {
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
  // the loop recorder's state (for the OLED + any loop UI).
  readonly looper: LooperView;
  // pads currently held/lit (by degree), for visual press state.
  readonly litPads: readonly Degree[];
  // OLED lines (non-menu state: key/chord on the big line, patch/mode on the small).
  readonly screenBig: string; // key+scale, a flashed name, or the live menu
  readonly screenSmall: string; // patch + mode, or the menu's other fields
  // When a menu is open, the full field list as fitted rows (empty otherwise). The
  // Screen renders this as a vertical list so adding fields never overflows the OLED.
  readonly menuRows: readonly MenuRow[];
}

export type Listener = (vm: ViewModel) => void;
