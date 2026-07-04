import type { RigSync } from '../../rig/rigSync';
import { claim, release, upsertMember, pruneMembers, holderOf, canClaim, emptyJam, GONE_MS, type Jam } from '../domain/jam';

// The Jam session service: owns the live Jam state (who is here + who holds which device), threads
// presence over the RigSync channel, and heartbeats so peers can prune the disconnected. All the
// occupancy RULES live in the pure domain; this layer is the plumbing (timers, sync, subscribers).

const HEARTBEAT_MS = 5_000;

export type JamListener = (jam: Jam) => void;

export class JamService {
  private jam: Jam;
  private readonly sync: RigSync;
  private readonly listeners = new Set<JamListener>();
  private readonly offSync: () => void;
  private readonly beat: ReturnType<typeof setInterval>;

  constructor(roomId: string, sync: RigSync, name?: string) {
    this.sync = sync;
    this.jam = emptyJam(roomId, sync.self, name ?? 'player', Date.now());
    this.offSync = sync.onEvent((ev) => {
      if (ev.type !== 'presence') return;
      this.jam = upsertMember(this.jam, { peerId: ev.peer, name: ev.peer, holding: ev.holding, lastSeen: Date.now() });
      this.publish();
    });
    // heartbeat + prune on one cadence (prune uses the domain's GONE_MS off each member's lastSeen)
    this.beat = setInterval(() => {
      this.announce();
      const pruned = pruneMembers(this.jam, Date.now());
      if (pruned !== this.jam && Object.keys(pruned.members).length !== Object.keys(this.jam.members).length) {
        this.jam = pruned;
        this.publish();
      }
    }, HEARTBEAT_MS);
    this.announce(); // introduce ourselves right away
  }

  private announce(): void {
    this.sync.send({ type: 'presence', peer: this.jam.self, holding: this.jam.members[this.jam.self]?.holding ?? null });
  }

  private publish(): void {
    for (const cb of this.listeners) cb(this.jam);
  }

  subscribe(cb: JamListener): () => void {
    this.listeners.add(cb);
    cb(this.jam);
    return () => this.listeners.delete(cb);
  }

  view(): Jam {
    return this.jam;
  }

  // Can this peer take the device (free, or already ours)?
  canClaim(device: string): boolean {
    return canClaim(this.jam, this.jam.self, device);
  }
  holderOf(device: string): string | null {
    return holderOf(this.jam, device);
  }

  // Take a device (called when focusing it). Broadcasts so everyone sees the lock.
  claim(device: string): void {
    this.jam = claim(this.jam, this.jam.self, device, Date.now());
    this.announce();
    this.publish();
  }
  // Let go (back to the all-view / leaving).
  release(): void {
    this.jam = release(this.jam, this.jam.self, Date.now());
    this.announce();
    this.publish();
  }

  dispose(): void {
    clearInterval(this.beat);
    this.release(); // best-effort: tell the room we are gone (the heartbeat gap is the backstop)
    this.offSync();
    this.listeners.clear();
  }
}

export { GONE_MS };
