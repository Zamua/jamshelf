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
  readonly lastInput: number; // ms epoch of this peer's last input on the device it holds
}

export const GONE_MS = 12_000; // no heartbeat within this -> the member is treated as disconnected
export const IDLE_MS = 60_000; // no input within this -> the member relinquishes its device

export function emptyJam(id: string, self: string, name: string, now: number): Jam {
  return { id, self, members: { [self]: { peerId: self, name, holding: null, lastSeen: now } }, lastInput: now };
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

// Record a peer's presence, then settle any device two members both hold: the claimWinner keeps it,
// the other is back in the all-view. Every peer settles the same way, so they all agree.
export function observe(jam: Jam, m: Member): Jam {
  const next = upsertMember(jam, m);
  const keeper = new Map<string, string>(); // device -> winning peer
  for (const p of Object.values(next.members)) {
    if (p.holding === null) continue;
    const cur = keeper.get(p.holding);
    keeper.set(p.holding, cur === undefined ? p.peerId : claimWinner(cur, p.peerId));
  }
  let members = next.members;
  for (const p of Object.values(next.members)) {
    if (p.holding !== null && keeper.get(p.holding) !== p.peerId) members = { ...members, [p.peerId]: { ...p, holding: null } };
  }
  return members === next.members ? next : { ...next, members };
}

// Has a holder gone long enough without input to give its device up?
export function idleExpired(lastInput: number, now: number): boolean {
  return now - lastInput > IDLE_MS;
}

// A peer left: it holds nothing and is no longer here (self never leaves its own view).
export function leave(jam: Jam, peer: string): Jam {
  if (peer === jam.self || !(peer in jam.members)) return jam;
  const { [peer]: _gone, ...members } = jam.members;
  return { ...jam, members };
}

// Drop members whose heartbeat is older than GONE_MS (self is never dropped). Unchanged if none.
export function pruneMembers(jam: Jam, now: number): Jam {
  const members: Record<string, Member> = {};
  for (const [id, m] of Object.entries(jam.members)) {
    if (id === jam.self || now - m.lastSeen <= GONE_MS) members[id] = m;
  }
  return Object.keys(members).length === Object.keys(jam.members).length ? jam : { ...jam, members };
}

// --- the session lifecycle: every change to this peer's view of the jam goes through nextJam ---

export type JamEvent =
  | { readonly type: 'claim'; readonly device: string } // this peer focuses a device
  | { readonly type: 'release' } // this peer goes back to the all-view
  | { readonly type: 'presence'; readonly peer: string; readonly holding: string | null } // a peer's heartbeat
  | { readonly type: 'leave'; readonly peer: string }
  | { readonly type: 'input' } // this peer played its device
  | { readonly type: 'tick' }; // the heartbeat: announce, prune the silent, release when idle

export type JamEffect =
  | { readonly kind: 'announce' } // send this peer's presence
  | { readonly kind: 'lost' }; // this peer does not hold the device it is focused on: drop the focus

export interface JamTransition {
  readonly jam: Jam;
  readonly effects: readonly JamEffect[];
}

const heldBy = (jam: Jam, peer: string): string | null => jam.members[peer]?.holding ?? null;

export function nextJam(jam: Jam, e: JamEvent, now: number): JamTransition {
  switch (e.type) {
    case 'claim':
      // refused (someone else holds it): the focus has to go
      if (!canClaim(jam, jam.self, e.device)) return { jam, effects: [{ kind: 'lost' }] };
      return { jam: { ...claim(jam, jam.self, e.device, now), lastInput: now }, effects: [{ kind: 'announce' }] };
    case 'release':
      return { jam: release(jam, jam.self, now), effects: [{ kind: 'announce' }] };
    case 'presence': {
      if (e.peer === jam.self) return { jam, effects: [] }; // a relay echo: local state is the truth for self
      const next = observe(jam, { peerId: e.peer, name: e.peer, holding: e.holding, lastSeen: now });
      const lostRace = heldBy(jam, jam.self) !== null && heldBy(next, jam.self) === null;
      return { jam: next, effects: lostRace ? [{ kind: 'announce' }, { kind: 'lost' }] : [] };
    }
    case 'leave':
      return { jam: leave(jam, e.peer), effects: [] };
    case 'input':
      return { jam: { ...jam, lastInput: now }, effects: [] };
    case 'tick': {
      const pruned = pruneMembers(jam, now);
      if (heldBy(pruned, jam.self) !== null && idleExpired(jam.lastInput, now)) {
        return { jam: release(pruned, jam.self, now), effects: [{ kind: 'announce' }, { kind: 'lost' }] };
      }
      return { jam: pruned, effects: [{ kind: 'announce' }] };
    }
  }
}
