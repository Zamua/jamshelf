// A rig = a set of instruments sharing one session at /rig/<uuid>. The config (which instruments,
// which is on the desk) is stored locally, keyed by the uuid; the uuid in the URL is what makes a
// rig linkable (and, later, a multiplayer room id). Every access is guarded so a bad/absent store
// degrades to null rather than throwing.

export interface RigConfig {
  readonly instruments: string[]; // instrument ids in the rig
  readonly desk: string; // the instrument currently on the desk
}

const key = (uuid: string) => `jamshelf/rigs/${uuid}`;

// A short, URL-friendly id (8 chars base36) from the crypto RNG.
function shortId(): string {
  const buf = new Uint32Array(2);
  (globalThis.crypto ?? ({ getRandomValues: (a: Uint32Array) => a } as Crypto)).getRandomValues(buf);
  return (buf[0].toString(36) + buf[1].toString(36)).slice(0, 8).padEnd(8, '0');
}

// Create + persist a rig, returning its uuid. The desk defaults to the first instrument.
export function createRig(instruments: string[]): string {
  const uuid = shortId();
  const config: RigConfig = { instruments, desk: instruments[0] };
  try {
    globalThis.localStorage?.setItem(key(uuid), JSON.stringify(config));
  } catch {
    /* storage disabled - the rig still works this session via the returned config */
  }
  return uuid;
}

export function loadRig(uuid: string): RigConfig | null {
  try {
    const raw = globalThis.localStorage?.getItem(key(uuid));
    if (!raw) return null;
    const c = JSON.parse(raw) as RigConfig;
    if (!Array.isArray(c.instruments) || c.instruments.length === 0) return null;
    return c;
  } catch {
    return null;
  }
}

// Persist a change to which instrument is on the desk (so re-opening the rig restores it).
export function saveDesk(uuid: string, desk: string): void {
  const c = loadRig(uuid);
  if (!c) return;
  try {
    globalThis.localStorage?.setItem(key(uuid), JSON.stringify({ ...c, desk }));
  } catch {
    /* ignore */
  }
}
