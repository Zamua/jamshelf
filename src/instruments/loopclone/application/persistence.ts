// The recorded loops are seconds of stereo Float32 PCM (megabytes) - far past localStorage's ~5MB
// string quota - so they persist to IndexedDB, keyed by the instrument namespace (like the HiClone
// looper). A narrow port keeps the engine off the storage API; the adapter is fully guarded so a
// missing / disabled IndexedDB degrades to a no-op rather than throwing.

export interface SerializedTrack {
  readonly ch: Float32Array[]; // [L, R] PCM of exactly loopLen samples
  readonly level: number; // fader 0..1
  readonly muted: boolean;
}

export interface SerializedLoops {
  readonly v: 1; // shape tag: reject an incompatible old payload
  readonly sampleRate: number;
  readonly loopLen: number; // samples per loop (the grid the tracks share)
  readonly bars: number;
  readonly tracks: (SerializedTrack | null)[]; // one per track; null = empty
}

export interface LoopStore {
  load(): Promise<SerializedLoops | null>;
  save(state: SerializedLoops): void; // fire-and-forget
  clear(): void;
}

// A stored loop set this build can restore: the current shape version, with a loop length.
export function parseSerializedLoops(raw: unknown): SerializedLoops | null {
  const v = raw as Partial<SerializedLoops> | null | undefined;
  return v && v.v === 1 && Array.isArray(v.tracks) && typeof v.loopLen === 'number' && v.loopLen > 0 ? (v as SerializedLoops) : null;
}

// A no-op store (solo/tests, or when there is nothing to persist to).
export class NullLoopStore implements LoopStore {
  async load(): Promise<SerializedLoops | null> {
    return null;
  }
  save(): void {}
  clear(): void {}
}
