import type { DrumSettings, SettingsStore } from '../../application/ports';

// Persists the TR-B0B's durable settings (pattern + tempo + volume + selected voice) to Web
// Storage, NAMESPACED per instrument (`jamshelf/trb0b/settings`). Every access is guarded: storage
// can be absent / disabled / over quota and a stored payload can be corrupt or from an older shape.
// In every such case we degrade to "no saved state" (the controller's coerceSettings validates the
// shape per-field), so a bad localStorage can never break the app.
export class LocalStorageDrumSettings implements SettingsStore {
  private readonly key: string;
  constructor(namespace: string) {
    this.key = `jamshelf/${namespace}/settings`;
  }

  load(): DrumSettings | null {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (!raw) return null;
      const obj = JSON.parse(raw) as { v?: number };
      return obj && obj.v === 1 ? (obj as unknown as DrumSettings) : null;
    } catch {
      return null;
    }
  }

  save(settings: DrumSettings): void {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify({ v: 1, ...settings }));
    } catch {
      /* quota exceeded / storage disabled - settings just won't persist this run */
    }
  }
}
