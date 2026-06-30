import type { LooperStore, SerializedLooper } from '../../application/persistence';

// The recorded loops are seconds of stereo Float32 audio - far past the ~5MB string
// quota of localStorage - so they live in IndexedDB, which stores typed arrays
// natively (structured clone) and has a much larger quota. One shared db/store holds
// every instrument's loops, keyed by the instrument's namespace, so they never collide.
// Every access is guarded: with no IndexedDB (SSR / old browser / private mode) the
// store degrades to a no-op, so audio persistence simply does nothing rather than throwing.
const DB_NAME = 'jamshelf';
const STORE = 'looper';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const idb = globalThis.indexedDB;
      if (!idb) return resolve(null);
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class IndexedDbLooperStore implements LooperStore {
  private readonly key: string;
  constructor(namespace: string) {
    this.key = namespace; // one record per instrument, keyed by its namespace
  }

  async load(): Promise<SerializedLooper | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(this.key);
        req.onsuccess = () => {
          const val = req.result as SerializedLooper | undefined;
          resolve(val && val.v === 1 && val.tracks?.length > 0 ? val : null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  save(state: SerializedLooper): void {
    void openDb().then((db) => {
      if (!db) return;
      try {
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(state, this.key);
      } catch {
        /* quota / transaction failure - the loops just won't persist this run */
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
