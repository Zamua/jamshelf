import { describe, it, expect, beforeEach } from 'vitest';
import { IdbRecord, LocalSettingsStore, migrateSettingsNamespace } from '../storage';

class MemLS {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
}

describe('LocalSettingsStore', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemLS();
  });

  it('round-trips settings under the instrument namespace', () => {
    new LocalSettingsStore<{ volume: number }>('trb0b').save({ volume: 0.4 });
    expect(new LocalSettingsStore('trb0b').load()).toEqual({ v: 1, volume: 0.4 });
    expect(new LocalSettingsStore('hiclone').load()).toBeNull();
  });

  it('reads nothing from a corrupt or other-version payload', () => {
    localStorage.setItem('jamshelf/trb0b/settings', '{not json');
    expect(new LocalSettingsStore('trb0b').load()).toBeNull();
    localStorage.setItem('jamshelf/trb0b/settings', '{"v":2,"volume":1}');
    expect(new LocalSettingsStore('trb0b').load()).toBeNull();
  });

  it('migrates a renamed namespace once, never over newer settings', () => {
    localStorage.setItem('jamshelf/old/settings', '{"v":1,"a":1}');
    migrateSettingsNamespace('old', 'new');
    expect(localStorage.getItem('jamshelf/new/settings')).toBe('{"v":1,"a":1}');
    expect(localStorage.getItem('jamshelf/old/settings')).toBeNull();
    localStorage.setItem('jamshelf/old/settings', '{"v":1,"a":2}');
    migrateSettingsNamespace('old', 'new');
    expect(localStorage.getItem('jamshelf/new/settings')).toBe('{"v":1,"a":1}');
  });
});

describe('IdbRecord', () => {
  it('loads nothing when IndexedDB is unavailable', async () => {
    expect(await new IdbRecord('k', () => 1).load()).toBeNull();
  });
});
