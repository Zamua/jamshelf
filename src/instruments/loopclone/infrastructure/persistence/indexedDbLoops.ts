import type { LoopStore, SerializedLoops } from '../../application/persistence';

// LoopClone loops persisted to IndexedDB (the shared jamshelf db / looper store, like the HiClone
// looper), keyed by the instrument namespace so they never collide. Every access is guarded: with no
// IndexedDB (SSR / old browser / private mode) the store is a silent no-op.

const DB_NAME = 'jamshelf';
const STORE = 'looper';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const idb = globalThis.indexedDB;
      if (!idb) return resolve(null);
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class IndexedDbLoopStore implements LoopStore {
  private readonly key: string;
  constructor(namespace: string) {
    this.key = `${namespace}:loops`;
  }

  async load(): Promise<SerializedLoops | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(this.key);
        req.onsuccess = () => {
          const v = req.result as SerializedLoops | undefined;
          resolve(v && v.v === 1 && Array.isArray(v.tracks) && v.loopLen > 0 ? v : null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  save(state: SerializedLoops): void {
    void openDb().then((db) => {
      if (!db) return;
      try {
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(state, this.key);
      } catch {
        /* over quota / disabled - drop it */
      }
    });
  }

  clear(): void {
    void openDb().then((db) => {
      if (!db) return;
      try {
        db.transaction(STORE, 'readwrite').objectStore(STORE).delete(this.key);
      } catch {
        /* ignore */
      }
    });
  }
}
