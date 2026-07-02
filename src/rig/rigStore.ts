// A rig = a set of instruments sharing one session at /rig/<uuid>. Each instrument lies FLAT on the
// desk at a scattered position (like stickers on a laptop lid); the config stores those placements
// so the layout is stable + linkable. The uuid in the URL is what makes a rig sharable (and later a
// multiplayer room). Every access is guarded so a bad/absent store degrades to null.

// A flat placement on the desk: center (x, z) + a yaw (rotation about the vertical), lying flat.
export interface Placement {
  x: number;
  z: number;
  yaw: number;
}

export interface RigConfig {
  readonly instruments: string[]; // instrument ids in the rig
  readonly placements: Record<string, Placement>; // where each lies on the desk
}

const key = (uuid: string) => `jamshelf/rigs/${uuid}`;

// The desk cluster center (x, z) the instruments scatter around.
const CLUSTER = { x: 0, z: 1.2 } as const;

// A scattered flat placement for a new instrument: near the cluster center, offset + yaw jittered
// so the pile looks natural + chaotic (overlap is fine, even wanted). Nudged away from an exact
// clash with an existing one so two don't land perfectly stacked.
export function scatterFor(existing: Record<string, Placement>): Placement {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  let best: Placement | null = null;
  let bestGap = -1;
  // try a few candidates, keep the one least-stacked on the others (but still clustered + overlapping)
  for (let i = 0; i < 8; i++) {
    const p: Placement = { x: CLUSTER.x + rand(-1.3, 1.3), z: CLUSTER.z + rand(-1.0, 1.0), yaw: rand(-0.5, 0.5) };
    let gap = 99;
    for (const e of Object.values(existing)) gap = Math.min(gap, Math.hypot(p.x - e.x, p.z - e.z));
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return best!;
}

// The centroid of a set of placements (for framing the all-view camera).
export function centroid(placements: Record<string, Placement>): { x: number; z: number } {
  const vals = Object.values(placements);
  if (vals.length === 0) return { x: CLUSTER.x, z: CLUSTER.z };
  const sx = vals.reduce((a, p) => a + p.x, 0);
  const sz = vals.reduce((a, p) => a + p.z, 0);
  return { x: sx / vals.length, z: sz / vals.length };
}

// A short, URL-friendly id (8 chars base36) from the crypto RNG.
function shortId(): string {
  const buf = new Uint32Array(2);
  (globalThis.crypto ?? ({ getRandomValues: (a: Uint32Array) => a } as Crypto)).getRandomValues(buf);
  return (buf[0].toString(36) + buf[1].toString(36)).slice(0, 8).padEnd(8, '0');
}

// Create + persist a rig, returning its uuid.
export function createRig(instruments: string[], placements: Record<string, Placement>): string {
  const uuid = shortId();
  const config: RigConfig = { instruments, placements };
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
    if (!c.placements) return null;
    return c;
  } catch {
    return null;
  }
}

// Persist an updated placement (e.g. after a drag-to-reposition).
export function savePlacement(uuid: string, id: string, p: Placement): void {
  const c = loadRig(uuid);
  if (!c) return;
  try {
    globalThis.localStorage?.setItem(key(uuid), JSON.stringify({ ...c, placements: { ...c.placements, [id]: p } }));
  } catch {
    /* ignore */
  }
}
