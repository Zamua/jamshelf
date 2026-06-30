import type {
  ArpPattern,
  BassMode,
  DrumKit,
  FxMode,
  GlideMode,
  PlayMode,
  Rate,
  ScaleName,
  StrumSpeed,
} from '../domain/music';
import type { PatchName } from './ports';

// The DURABLE musical settings, as a plain serializable object (no transient state
// like the held pads, the morph quality, the menu, power, or the loop transport). A
// `v` tag lets a future shape migrate / reject an incompatible old payload.
export interface SettingsSnapshot {
  readonly v: 1;
  readonly root: number;
  readonly scale: ScaleName;
  readonly octave: number;
  readonly patch: PatchName;
  readonly bpm: number;
  readonly volume: number;
  readonly themeIndex: number;
  readonly mode: PlayMode;
  readonly arpPattern: ArpPattern;
  readonly arpRate: Rate;
  readonly repeatRate: Rate;
  readonly strumSpeed: StrumSpeed;
  readonly bass: BassMode;
  readonly fx: FxMode;
  readonly glide: GlideMode;
  readonly drumKit: DrumKit;
  readonly inversion: number;
}

// A place to persist the settings snapshot (localStorage in the browser, a no-op or
// in-memory fake in tests). Kept a narrow PORT so the application never imports the
// Web Storage API directly. `load` returns null when there is nothing valid stored.
export interface SettingsStore {
  load(): SettingsSnapshot | null;
  save(snapshot: SettingsSnapshot): void;
}
