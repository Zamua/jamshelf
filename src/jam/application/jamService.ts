import type { RigSync } from '../../rig/rigSync';
import { claim, release, observe, pruneMembers, holderOf, canClaim, emptyJam, idleExpired, GONE_MS, type Jam } from '../domain/jam';

// The Jam session service: owns the live Jam state (who is here + who holds which device), threads
// presence over the RigSync channel, and heartbeats so peers can prune the disconnected. All the
// occupancy RULES live in the pure domain; this layer is the plumbing (timers, sync, subscribers).

const HEARTBEAT_MS = 5_000;

export type JamListener = (jam: Jam) => void;

export class JamService {
  private jam: Jam;
  private readonly sync: RigSync;
  private readonly listeners = new Set<JamListener>();
  private readonly lostListeners = new Set<() => void>();
  private lastInput = Date.now();
  private readonly offSync: () => void;
  private readonly beat: ReturnType<typeof setInterval>;

  constructor(roomId: string, sync: RigSync, name?: string) {
    this.sync = sync;
    this.jam = emptyJam(roomId, sync.self, name ?? 'player', Date.now());
    this.offSync = sync.onEvent((ev) => {
      // A relay may echo our own presence back late; local state is the truth for self.
      if (ev.type !== 'presence' || ev.peer === this.jam.self) return;
      const held = this.held();
      this.jam = observe(this.jam, { peerId: ev.peer, name: ev.peer, holding: ev.holding, lastSeen: Date.now() });
      if (held !== null && this.held() === null) this.lose(); // lost a simultaneous claim
      this.publish();
    });
    // heartbeat + prune + idle release on one cadence
    this.beat = setInterval(() => {
      if (this.held() !== null && idleExpired(this.lastInput, Date.now())) {
        this.jam = release(this.jam, this.jam.self, Date.now());
        this.lose();
        this.publish();
      }
      this.announce();
      const pruned = pruneMembers(this.jam, Date.now());
      if (pruned !== this.jam && Object.keys(pruned.members).length !== Object.keys(this.jam.members).length) {
        this.jam = pruned;
        this.publish();
      }
    }, HEARTBEAT_MS);
    this.announce(); // introduce ourselves right away
  }

  private held(): string | null {
    return this.jam.members[this.jam.self]?.holding ?? null;
  }

  // The device was taken from us (race or idle) rather than released by choice.
  private lose(): void {
    this.announce();
    for (const cb of this.lostListeners) cb();
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

  // Fires when this peer loses its device without releasing it: a lost claim race or idling out.
  onLost(cb: () => void): () => void {
    this.lostListeners.add(cb);
    return () => this.lostListeners.delete(cb);
  }

  // Player input on the held device; holds off the idle release.
  touch(): void {
    this.lastInput = Date.now();
  }

  // Take a device (called when focusing it). Broadcasts so everyone sees the lock.
  claim(device: string): void {
    this.lastInput = Date.now();
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
    try {
      this.release(); // best-effort: tell the room we are gone (the heartbeat gap is the backstop)
    } catch {
      // the sync channel may already be torn down (mode-transition cleanup ordering) - fine
    }
    this.offSync();
    this.listeners.clear();
    this.lostListeners.clear();
  }
}

export { GONE_MS };
