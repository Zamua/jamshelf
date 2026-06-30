import type { SettingsSnapshot, SettingsStore } from '../../application/persistence';

const KEY = 'chord-synth/settings';

// Persists the durable settings to Web Storage. Every access is guarded: storage can
// be absent (SSR), disabled (private mode), or over quota, and a stored payload can be
// corrupt or from an older shape - in every such case we degrade to "no saved state"
// rather than throwing, so a bad localStorage can never break the app.
export class LocalStorageSettingsStore implements SettingsStore {
  load(): SettingsSnapshot | null {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw) as { v?: number };
      // only accept the version this build understands
      return obj && obj.v === 1 ? (obj as SettingsSnapshot) : null;
    } catch {
      return null;
    }
  }

  save(snapshot: SettingsSnapshot): void {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(snapshot));
    } catch {
      /* quota exceeded / storage disabled - settings just won't persist this run */
    }
  }
}
