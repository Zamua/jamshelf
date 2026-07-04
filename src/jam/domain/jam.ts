// The Jam bounded context. A Jam is a live session: several people playing ONE rig together. The rig
// (instruments + placements + patch) lives in the rig store; the Jam adds the SESSION - who is here
// and who holds which instrument. Occupancy is a hard lock (one player per device); the device owns
// its memory, not the player (see docs/RIG.md + docs/MULTIPLAYER.md). Pure + I/O-free.

export interface Member {
  readonly peerId: string;
  readonly name: string;
  readonly holding: string | null; // the deviceId this member is playing, or null (in the all-view)
  readonly lastSeen: number; // ms epoch of the last heartbeat, for idle / disconnect detection
}

export interface Jam {
  readonly id: string; // the room / jam id (shared in the link)
  readonly self: string; // this peer's id (always present in members)
  readonly members: Record<string, Member>; // by peerId
}

export const GONE_MS = 12_000; // no heartbeat within this -> the member is treated as disconnected
export const IDLE_MS = 60_000; // no input within this -> the member relinquishes its device

export function emptyJam(id: string, self: string, name: string, now: number): Jam {
  return { id, self, members: { [self]: { peerId: self, name, holding: null, lastSeen: now } } };
}

// The peer currently holding `device` (null = free).
export function holderOf(jam: Jam, device: string): string | null {
  for (const m of Object.values(jam.members)) if (m.holding === device) return m.peerId;
  return null;
}

// Can `peer` take `device`? Free, or already theirs.
export function canClaim(jam: Jam, peer: string, device: string): boolean {
  const h = holderOf(jam, device);
  return h === null || h === peer;
}

// Two peers claimed the same device in the same moment: the lower id wins (deterministic on every peer).
export function claimWinner(a: string, b: string): string {
  return a < b ? a : b;
}

// `peer` takes `device` (dropping any device they held). A no-op if the device is held by someone else.
export function claim(jam: Jam, peer: string, device: string, now: number): Jam {
  if (!canClaim(jam, peer, device)) return jam;
  const prev = jam.members[peer];
  const m: Member = { peerId: peer, name: prev?.name ?? peer, holding: device, lastSeen: now };
  return { ...jam, members: { ...jam.members, [peer]: m } };
}

// `peer` lets go of whatever they held (back to the all-view).
export function release(jam: Jam, peer: string, now: number): Jam {
  const prev = jam.members[peer];
  if (!prev) return jam;
  return { ...jam, members: { ...jam.members, [peer]: { ...prev, holding: null, lastSeen: now } } };
}

// Record a member's heartbeat (join / presence update).
export function upsertMember(jam: Jam, m: Member): Jam {
  return { ...jam, members: { ...jam.members, [m.peerId]: m } };
}

// Drop members whose heartbeat is older than GONE_MS (self is never dropped).
export function pruneMembers(jam: Jam, now: number): Jam {
  const members: Record<string, Member> = {};
  for (const [id, m] of Object.entries(jam.members)) {
    if (id === jam.self || now - m.lastSeen <= GONE_MS) members[id] = m;
  }
  return { ...jam, members };
}
