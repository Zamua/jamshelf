// The rig's multiplayer sync layer. A narrow port so the app doesn't care about the wire transport;
// applying a remote event is a straight overwrite because each item has a single writer (see
// docs/MULTIPLAYER.md - the hard-lock occupancy makes the shared state conflict-free by construction).

export type RigSyncEvent =
  | { type: 'transport'; running: boolean; bpm: number } // the shared beat: tempo + play/stop
  | { type: 'wire'; device: string; on: boolean } // a patch cable toggled
  | { type: 'presence'; peer: string; holding: string | null } // who holds which device
  | { type: 'hello' } // a peer joined: existing peers reply with a snapshot
  | { type: 'snapshot'; running: boolean; bpm: number; wires: string[] }; // current state, for a joiner

export interface RigSync {
  send(ev: RigSyncEvent): void;
  onEvent(cb: (ev: RigSyncEvent) => void): () => void; // remote events only (never your own)
  readonly self: string; // this peer's id
  dispose(): void;
}

// Solo / no room: a no-op.
export class NullRigSync implements RigSync {
  readonly self = 'solo';
  send(): void {}
  onEvent(): () => void {
    return () => {};
  }
  dispose(): void {}
}

// Same-device, multiple tabs: real multiplayer over BroadcastChannel (a shared wall clock, so the
// transport phase-locks trivially). Exercises the whole sync wiring with no networking; the WebRTC
// adapter for cross-device is the next layer (pending the signaling decision, see docs/MULTIPLAYER.md).
export class BroadcastChannelSync implements RigSync {
  readonly self: string;
  private readonly ch: BroadcastChannel;
  private readonly subs = new Set<(ev: RigSyncEvent) => void>();

  constructor(room: string) {
    // a per-tab id (Math.random is fine in app code); used to drop echoes of our own messages
    this.self = 'p' + Math.random().toString(36).slice(2, 9);
    this.ch = new BroadcastChannel('jamshelf-rig-' + room);
    this.ch.onmessage = (e: MessageEvent<{ from: string; ev: RigSyncEvent }>) => {
      const msg = e.data;
      if (!msg || msg.from === this.self) return;
      for (const cb of this.subs) cb(msg.ev);
    };
  }

  send(ev: RigSyncEvent): void {
    this.ch.postMessage({ from: this.self, ev });
  }
  onEvent(cb: (ev: RigSyncEvent) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  dispose(): void {
    this.subs.clear();
    try {
      this.ch.close();
    } catch {
      /* ignore */
    }
  }
}
