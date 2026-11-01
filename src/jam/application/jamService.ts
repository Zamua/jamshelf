import type { RigSync } from '../../rig/rigSync';
import { holderOf, canClaim, emptyJam, nextJam, GONE_MS, type Jam, type JamEvent } from '../domain/jam';

// The Jam session shell: feeds every input (focus, presence, leaves, input, the heartbeat) to the
// pure nextJam and performs what comes back (send presence, tell the UI the device is gone).

const HEARTBEAT_MS = 5_000;

export type JamListener = (jam: Jam) => void;

export class JamService {
  private jam: Jam;
  private readonly sync: RigSync;
  private readonly listeners = new Set<JamListener>();
  private readonly lostListeners = new Set<() => void>();
  private readonly offSync: () => void;
  private readonly beat: ReturnType<typeof setInterval>;

  constructor(roomId: string, sync: RigSync, name?: string) {
    this.sync = sync;
    this.jam = emptyJam(roomId, sync.self, name ?? 'player', Date.now());
    this.offSync = sync.onEvent((ev) => {
      if (ev.type === 'presence' || ev.type === 'leave') this.dispatch(ev);
    });
    this.beat = setInterval(() => this.dispatch({ type: 'tick' }), HEARTBEAT_MS);
    this.announce(); // introduce ourselves right away
  }

  private dispatch(event: JamEvent): void {
    const { jam, effects } = nextJam(this.jam, event, Date.now());
    const changed = jam !== this.jam;
    this.jam = jam;
    for (const fx of effects) {
      if (fx.kind === 'announce') this.announce();
      else for (const cb of this.lostListeners) cb();
    }
    if (changed) this.publish();
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

  // Fires when this peer does not hold the device it focused: a refused claim, a lost claim race,
  // or idling out.
  onLost(cb: () => void): () => void {
    this.lostListeners.add(cb);
    return () => this.lostListeners.delete(cb);
  }

  // Player input on the held device; holds off the idle release.
  touch(): void {
    this.dispatch({ type: 'input' });
  }

  // Take a device (called when focusing it). Broadcasts so everyone sees the lock.
  claim(device: string): void {
    this.dispatch({ type: 'claim', device });
  }
  // Let go (back to the all-view / leaving).
  release(): void {
    this.dispatch({ type: 'release' });
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
