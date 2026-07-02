import type { SettingsStore, StylophoneSettings } from '../../application/ports';

// Persists the StyloClone's durable settings to Web Storage, NAMESPACED per instrument
// (`jamshelf/styloclone/settings`) so each instrument on the shelf keeps its own state and
// they never collide. Every access is guarded: storage can be absent (SSR), disabled
// (private mode), or over quota, and a stored payload can be corrupt or from an older shape.
// In every such case we degrade to "no saved state" rather than throwing (the controller's
// coerceSettings validates the shape per-field), so a bad localStorage can never break the app.
export class LocalStorageStylophoneSettings implements SettingsStore {
  private readonly key: string;
  constructor(namespace: string) {
    this.key = `jamshelf/${namespace}/settings`;
  }

  load(): StylophoneSettings | null {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (!raw) return null;
      const obj = JSON.parse(raw) as { v?: number };
      // only accept the version this build understands; coerceSettings guards the fields
      return obj && obj.v === 1 ? (obj as unknown as StylophoneSettings) : null;
    } catch {
      return null;
    }
  }

  save(settings: StylophoneSettings): void {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify({ v: 1, ...settings }));
    } catch {
      /* quota exceeded / storage disabled - settings just won't persist this run */
    }
  }
}
