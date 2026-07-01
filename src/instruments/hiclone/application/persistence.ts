import {
  ARP_PATTERNS,
  BASS_MODES,
  DRUM_KITS,
  FX_MODES,
  GLIDE_MODES,
  INVERSIONS,
  PLAY_MODES,
  RATES,
  SCALE_ORDER,
  STRUM_SPEEDS,
  type ArpPattern,
  type BassMode,
  type DrumKit,
  type FxMode,
  type GlideMode,
  type PlayMode,
  type Rate,
  type ScaleName,
  type StrumSpeed,
} from '../domain/music';
import { PATCH_ORDER, type PatchName } from './ports';

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
  readonly inversions: readonly number[]; // per-pad inversion (7 entries, degree-1 indexed)
}

// Coerce an untrusted payload (stale shape, hand-edited storage, an older build) into
// a VALID snapshot: every field is checked against its known value set / numeric range
// and any bad one falls back to `fallback`. Pure + total, so the controller never has
// to trust what came out of storage, and it is testable on its own.
export function coerceSettings(raw: unknown, fallback: SettingsSnapshot): SettingsSnapshot {
  const r = (raw ?? {}) as Partial<Record<keyof SettingsSnapshot, unknown>>;
  const oneOf = <T>(val: unknown, allowed: readonly T[], dflt: T): T =>
    allowed.includes(val as T) ? (val as T) : dflt;
  const clampInt = (val: unknown, lo: number, hi: number, dflt: number): number =>
    typeof val === 'number' && Number.isFinite(val) ? Math.min(hi, Math.max(lo, Math.round(val))) : dflt;
  const clampNum = (val: unknown, lo: number, hi: number, dflt: number): number =>
    typeof val === 'number' && Number.isFinite(val) ? Math.min(hi, Math.max(lo, val)) : dflt;
  const clampIntArray = (val: unknown, len: number, lo: number, hi: number, dflt: readonly number[]): number[] =>
    Array.isArray(val) && val.length === len ? val.map((v) => clampInt(v, lo, hi, 0)) : [...dflt];
  return {
    v: 1,
    root: clampInt(r.root, 0, 11, fallback.root),
    scale: oneOf(r.scale, SCALE_ORDER, fallback.scale),
    octave: clampInt(r.octave, -2, 2, fallback.octave),
    patch: oneOf(r.patch, PATCH_ORDER, fallback.patch),
    bpm: clampInt(r.bpm, 40, 240, fallback.bpm),
    volume: clampNum(r.volume, 0, 1, fallback.volume),
    themeIndex: clampInt(r.themeIndex, 0, 999, fallback.themeIndex),
    mode: oneOf(r.mode, PLAY_MODES, fallback.mode),
    arpPattern: oneOf(r.arpPattern, ARP_PATTERNS, fallback.arpPattern),
    arpRate: oneOf(r.arpRate, RATES, fallback.arpRate),
    repeatRate: oneOf(r.repeatRate, RATES, fallback.repeatRate),
    strumSpeed: oneOf(r.strumSpeed, STRUM_SPEEDS, fallback.strumSpeed),
    bass: oneOf(r.bass, BASS_MODES, fallback.bass),
    fx: oneOf(r.fx, FX_MODES, fallback.fx),
    glide: oneOf(r.glide, GLIDE_MODES, fallback.glide),
    drumKit: oneOf(r.drumKit, DRUM_KITS, fallback.drumKit),
    inversions: clampIntArray(r.inversions, 7, 0, INVERSIONS - 1, fallback.inversions),
  };
}

// A place to persist the settings snapshot (localStorage in the browser, a no-op or
// in-memory fake in tests). Kept a narrow PORT so the application never imports the
// Web Storage API directly. `load` returns null when there is nothing valid stored.
export interface SettingsStore {
  load(): SettingsSnapshot | null;
  save(snapshot: SettingsSnapshot): void;
}

// The recorded looper layers, serialized to raw PCM. Each track is its channels of
// Float32 samples (one loop's worth); the loop geometry + tempo describe how to play
// them back. This is BINARY + large (seconds of stereo audio per layer), so it lives
// in IndexedDB, never localStorage.
export interface SerializedTrack {
  readonly channels: Float32Array[];
}
export interface SerializedLooper {
  readonly v: 1;
  readonly sampleRate: number;
  readonly loopLenSamples: number;
  readonly loopBeats: number;
  readonly loopBars: number;
  readonly bpm: number;
  readonly tracks: SerializedTrack[]; // index 0 = the master (defines the length)
}

// Async store for the recorded loops (IndexedDB in the browser, a fake in tests). The
// looper owns this and writes itself out when the track set changes. `save`/`clear`
// are fire-and-forget; `load` resolves null when nothing (valid) is stored.
export interface LooperStore {
  load(): Promise<SerializedLooper | null>;
  save(state: SerializedLooper): void;
  clear(): void;
}
