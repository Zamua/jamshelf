import type { SettingsSnapshot, SettingsStore } from '../../application/persistence';

// One-time migration for a renamed instrument namespace: copy the settings saved under a
// former namespace to the current one so an id rename doesn't orphan an existing install's
// durable prefs. No-op if nothing is stored under the old namespace or the new one already
// has state. (Recorded loops in IndexedDB are ephemeral and intentionally not migrated.)
export function migrateSettingsNamespace(oldNs: string, newNs: string): void {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    const oldKey = `jamshelf/${oldNs}/settings`;
    const old = ls.getItem(oldKey);
    if (old === null) return;
    if (ls.getItem(`jamshelf/${newNs}/settings`) === null) ls.setItem(`jamshelf/${newNs}/settings`, old);
    ls.removeItem(oldKey);
  } catch {
    /* storage disabled - nothing to migrate */
  }
}

// Persists the durable settings to Web Storage, NAMESPACED per instrument
// (`jamshelf/<id>/settings`) so each instrument on the shelf keeps its own state and
// they never collide. Every access is guarded: storage can be absent (SSR), disabled
// (private mode), or over quota, and a stored payload can be corrupt or from an older
// shape - in every such case we degrade to "no saved state" rather than throwing, so a
// bad localStorage can never break the app.
export class LocalStorageSettingsStore implements SettingsStore {
  private readonly key: string;
  constructor(namespace: string) {
    this.key = `jamshelf/${namespace}/settings`;
  }

  load(): SettingsSnapshot | null {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
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
      globalThis.localStorage?.setItem(this.key, JSON.stringify(snapshot));
    } catch {
      /* quota exceeded / storage disabled - settings just won't persist this run */
    }
  }
}
