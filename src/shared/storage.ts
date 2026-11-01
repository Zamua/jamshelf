// Browser persistence shared by every instrument, NAMESPACED per instrument so they never collide.
// Every access is guarded: storage can be absent, disabled (private mode) or over quota, and a stored
// payload can be corrupt or from an older shape. Each degrades to "nothing saved", never a throw.

const settingsKey = (namespace: string) => `jamshelf/${namespace}/settings`;

// Durable settings in localStorage at `jamshelf/<id>/settings`. load() hands back the stored payload
// unparsed (each controller's coerceSettings parses it); only the current shape version is accepted.
export class LocalSettingsStore<T extends object> {
  private readonly key: string;
  constructor(namespace: string) {
    this.key = settingsKey(namespace);
  }

  load(): unknown {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (!raw) return null;
      const obj: unknown = JSON.parse(raw);
      return typeof obj === 'object' && obj !== null && (obj as { v?: unknown }).v === 1 ? obj : null;
    } catch {
      return null;
    }
  }

  save(settings: T): void {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify({ v: 1, ...settings }));
    } catch {
      /* settings just won't persist this run */
    }
  }
}

// Carry settings saved under a former instrument id to its current one (once; the new id wins).
export function migrateSettingsNamespace(oldNs: string, newNs: string): void {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    const old = ls.getItem(settingsKey(oldNs));
    if (old === null) return;
    if (ls.getItem(settingsKey(newNs)) === null) ls.setItem(settingsKey(newNs), old);
    ls.removeItem(settingsKey(oldNs));
  } catch {
    /* nothing to migrate */
  }
}

// Recorded audio is megabytes of Float32 PCM, past localStorage's string quota, so it lives in
// IndexedDB (typed arrays store natively). One db/store holds every instrument's record.
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

// One IndexedDB record. `parse` turns what is stored into a T, or null when it is not a usable one.
export class IdbRecord<T> {
  private readonly key: string;
  private readonly parse: (raw: unknown) => T | null;
  constructor(key: string, parse: (raw: unknown) => T | null) {
    this.key = key;
    this.parse = parse;
  }

  async load(): Promise<T | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(this.key);
        req.onsuccess = () => resolve(this.parse(req.result));
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  save(value: T): void {
    void openDb().then((db) => {
      try {
        db?.transaction(STORE, 'readwrite').objectStore(STORE).put(value, this.key);
      } catch {
        /* over quota: it just won't persist this run */
      }
    });
  }

  clear(): void {
    void openDb().then((db) => {
      try {
        db?.transaction(STORE, 'readwrite').objectStore(STORE).delete(this.key);
      } catch {
        /* ignore */
      }
    });
  }
}
