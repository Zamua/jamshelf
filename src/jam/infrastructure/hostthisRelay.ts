import type { RigSync, RigSyncEvent } from '../../rig/rigSync';
import { parseRigConfig, type RigConfig } from '../../rig/rigStore';
import { GONE_MS } from '../domain/jam';
import { firstConnection, nextConnection, type Connection, type ConnectionEffect, type ConnectionEvent } from './relayConnection';

// The hostthis room backend for the RigSync port: cross-device multiplayer over hostthis rooms.
// The room is a shared KV namespace with a live relay. WRITES go via HTTP PUT /api/rooms/<id>/<key>
// (durable + mirrored to connected peers as a `put` frame); READS come over the room WebSocket (a
// `snapshot` of the KV on join, then live `put`/`delete` frames). Same-origin, so the app slug is
// wherever jamshelf is served - nothing to hardcode. A room is minted lazily on "go live".

// Mint a room under the served app; returns its uuid (the jam's live id).
export async function mintRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error(`room mint failed (${res.status})`);
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error('room mint returned no id');
  return body.id;
}

// The rig a jam plays lives at the room's `rig` key: the host writes it on go-live, joiners read it.
export async function putRoomRig(roomId: string, rig: RigConfig): Promise<void> {
  const config = { instruments: rig.instruments, placements: rig.placements, wires: rig.wires ?? [] };
  const res = await fetch(`/api/rooms/${roomId}/rig`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`room rig write failed (${res.status})`);
}
export async function fetchRoomRig(roomId: string): Promise<RigConfig> {
  const res = await fetch(`/api/rooms/${roomId}/rig`);
  if (!res.ok) throw new Error(`room rig read failed (${res.status})`);
  const rig = parseRigConfig(await res.json());
  if (!rig) throw new Error('room rig is malformed');
  return rig;
}

// --- translate between the flat RigSyncEvent and the room's KV keys ---
interface KV {
  key: string;
  value: Record<string, unknown>;
}
export function eventToKV(ev: RigSyncEvent): KV | null {
  switch (ev.type) {
    case 'transport':
      return { key: 'transport', value: { running: ev.running, bpm: ev.bpm } };
    case 'wire':
      return { key: `wire_${ev.device}`, value: { on: ev.on } };
    case 'presence':
      return { key: `presence_${ev.peer}`, value: { holding: ev.holding, at: Date.now() } };
    default:
      return null; // hello / snapshot are the BroadcastChannel backend's own handshake; a leave is a delete
  }
}
// Room values are written by any peer, so each is parsed here; a malformed one maps to nothing.
export function kvToEvent(key: string, value: unknown): RigSyncEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (key === 'transport') {
    return typeof v.bpm === 'number' && Number.isFinite(v.bpm) ? { type: 'transport', running: v.running === true, bpm: v.bpm } : null;
  }
  if (key.startsWith('wire_')) return { type: 'wire', device: key.slice(5), on: v.on === true };
  if (key.startsWith('presence_')) return { type: 'presence', peer: key.slice(9), holding: typeof v.holding === 'string' ? v.holding : null };
  return null;
}

// A presence the room replays on join is only news if its sender wrote it recently; anything older
// (or from a client that sent no time) belongs to a peer that left without saying so.
function stalePresence(key: string, value: unknown): boolean {
  if (!key.startsWith('presence_')) return false;
  const at = typeof value === 'object' && value !== null ? (value as { at?: unknown }).at : undefined;
  return typeof at !== 'number' || Date.now() - at > GONE_MS;
}

export class HostthisRelaySync implements RigSync {
  readonly self: string;
  private connection: Connection = firstConnection;
  private ws: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subs = new Set<(ev: RigSyncEvent) => void>();
  private readonly room: string;
  private readonly host: string;
  // coalesce rapid writes to the same key (a tempo drag) into one PUT, under the relay's rate limit
  private readonly pending = new Map<string, { value: unknown; timer: ReturnType<typeof setTimeout> }>();
  // the latest value per key whose PUT failed; resent when the socket reopens
  private readonly failed = new Map<string, unknown>();

  constructor(room: string, host: string = location.host) {
    this.self = 'p' + Math.random().toString(36).slice(2, 9);
    this.room = room;
    this.host = host;
    globalThis.addEventListener?.('pagehide', this.leave);
    globalThis.addEventListener?.('online', this.wake);
    globalThis.document?.addEventListener?.('visibilitychange', this.wake);
    this.connect();
  }

  private get closed(): boolean {
    return this.connection.kind === 'closed';
  }

  // Take our presence out of the room so a later joiner does not see us. keepalive lets the request
  // outlive a closing tab; a crash leaves the key, which joiners skip once it is GONE_MS old.
  private readonly leave = (): void => {
    void fetch(`/api/rooms/${this.room}/presence_${this.self}`, { method: 'DELETE', keepalive: true }).catch(() => {});
  };

  private readonly wake = (): void => {
    if (globalThis.document?.visibilityState === 'hidden') return;
    this.dispatch({ type: 'wake' });
  };

  private dispatch(event: ConnectionEvent): void {
    const { connection, effects } = nextConnection(this.connection, event, Math.random());
    this.connection = connection;
    for (const fx of effects) this.perform(fx);
  }

  private perform(fx: ConnectionEffect): void {
    switch (fx.kind) {
      case 'connect':
        return this.connect();
      case 'retryIn':
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.dispatch({ type: 'retryDue' });
        }, fx.ms);
        return;
      case 'cancelRetry':
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        return;
      case 'flush':
        for (const [key, value] of this.failed) this.put(key, value);
        return;
      case 'disconnect': {
        const ws = this.ws;
        this.ws = null;
        try {
          ws?.close();
        } catch {
          /* already closed */
        }
        return;
      }
    }
  }

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${this.host}/api/rooms/${this.room}/ws`);
    } catch {
      this.dispatch({ type: 'dropped' });
      return;
    }
    this.ws = ws;
    // events from a socket that has since been replaced are ignored
    ws.onopen = () => {
      if (this.ws === ws) this.dispatch({ type: 'opened' });
    };
    ws.addEventListener('message', (e) => {
      if (this.ws === ws) this.onFrame(String((e as MessageEvent).data));
    });
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.dispatch({ type: 'dropped' });
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private onFrame(data: string): void {
    let f: { type?: string; state?: Record<string, unknown>; key?: string; value?: unknown };
    try {
      f = JSON.parse(data);
    } catch {
      return;
    }
    if (f.type === 'snapshot' && typeof f.state === 'object' && f.state !== null) {
      // a key we still owe the room a newer value for keeps our value, not the room's older one
      for (const [k, v] of Object.entries(f.state)) if (!this.mine(v) && !stalePresence(k, v) && !this.owed(k)) this.emit(kvToEvent(k, v));
    } else if (f.type === 'put' && typeof f.key === 'string') {
      if (!this.mine(f.value)) this.emit(kvToEvent(f.key, f.value));
    } else if (f.type === 'delete' && typeof f.key === 'string' && f.key.startsWith('wire_')) {
      this.emit({ type: 'wire', device: f.key.slice(5), on: false });
    } else if (f.type === 'delete' && typeof f.key === 'string' && f.key.startsWith('presence_')) {
      this.emit({ type: 'leave', peer: f.key.slice(9) });
    }
  }
  private owed(key: string): boolean {
    return this.failed.has(key) || this.pending.has(key);
  }
  // The room sends every write to every socket, ours included: a value we wrote is not a remote event.
  private mine(value: unknown): boolean {
    return typeof value === 'object' && value !== null && (value as { from?: unknown }).from === this.self;
  }
  private emit(ev: RigSyncEvent | null): void {
    if (ev) for (const cb of this.subs) cb(ev);
  }

  send(ev: RigSyncEvent): void {
    const kv = eventToKV(ev);
    if (!kv || this.closed) return; // after dispose: a late farewell would recreate the presence it deleted
    const existing = this.pending.get(kv.key);
    if (existing) clearTimeout(existing.timer);
    this.failed.delete(kv.key); // a newer value supersedes one waiting to be resent
    const value = { ...kv.value, from: this.self };
    const timer = setTimeout(() => {
      this.pending.delete(kv.key);
      this.put(kv.key, value);
    }, 80);
    this.pending.set(kv.key, { value, timer });
  }

  // One write. A network failure, a 429 or a 5xx keeps the value to resend when the socket reopens.
  private put(key: string, value: unknown): void {
    if (this.closed) return;
    const keep = () => {
      if (!this.closed && !this.pending.has(key)) this.failed.set(key, value);
    };
    void fetch(`/api/rooms/${this.room}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    }).then(
      (res) => {
        if (res.ok) {
          if (this.failed.get(key) === value) this.failed.delete(key);
        } else if (res.status === 429 || res.status >= 500) keep();
      },
      keep,
    );
  }

  onEvent(cb: (ev: RigSyncEvent) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  dispose(): void {
    if (this.closed) return;
    globalThis.removeEventListener?.('pagehide', this.leave);
    globalThis.removeEventListener?.('online', this.wake);
    globalThis.document?.removeEventListener?.('visibilitychange', this.wake);
    this.leave();
    this.subs.clear();
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.failed.clear();
    this.dispatch({ type: 'dispose' });
  }
}
