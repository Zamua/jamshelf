import type { RigSync, RigSyncEvent } from '../../rig/rigSync';

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

// --- translate between the flat RigSyncEvent and the room's KV keys ---
interface KV {
  key: string;
  value: unknown;
}
export function eventToKV(ev: RigSyncEvent): KV | null {
  switch (ev.type) {
    case 'transport':
      return { key: 'transport', value: { running: ev.running, bpm: ev.bpm } };
    case 'wire':
      return { key: `wire_${ev.device}`, value: { on: ev.on } };
    case 'presence':
      return { key: `presence_${ev.peer}`, value: { holding: ev.holding } };
    default:
      return null; // hello / snapshot are the BroadcastChannel backend's own handshake
  }
}
export function kvToEvent(key: string, value: Record<string, unknown>): RigSyncEvent | null {
  if (key === 'transport') return { type: 'transport', running: !!value.running, bpm: Number(value.bpm) };
  if (key.startsWith('wire_')) return { type: 'wire', device: key.slice(5), on: !!value.on };
  if (key.startsWith('presence_')) return { type: 'presence', peer: key.slice(9), holding: (value.holding as string | null) ?? null };
  return null;
}

export class HostthisRelaySync implements RigSync {
  readonly self: string;
  private ws: WebSocket | null = null;
  private readonly subs = new Set<(ev: RigSyncEvent) => void>();
  private closed = false;
  private backoff = 500;
  private readonly room: string;
  private readonly host: string;
  // coalesce rapid writes to the same key (a tempo drag) into one PUT, under the relay's rate limit
  private readonly pending = new Map<string, { value: unknown; timer: ReturnType<typeof setTimeout> }>();

  constructor(room: string, host: string = location.host) {
    this.self = 'p' + Math.random().toString(36).slice(2, 9);
    this.room = room;
    this.host = host;
    this.open();
  }

  private open(): void {
    if (this.closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${this.host}/api/rooms/${this.room}/ws`);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 500;
    };
    ws.addEventListener('message', (e) => this.onFrame(String((e as MessageEvent).data)));
    ws.onclose = () => {
      this.ws = null;
      this.retry();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private retry(): void {
    if (this.closed) return;
    const wait = Math.min(this.backoff, 15000) * (0.5 + Math.random() * 0.5); // jitter 50-100%
    this.backoff = Math.min(this.backoff * 2, 15000);
    setTimeout(() => this.open(), wait);
  }

  private onFrame(data: string): void {
    let f: { type?: string; state?: Record<string, Record<string, unknown>>; key?: string; value?: Record<string, unknown> };
    try {
      f = JSON.parse(data);
    } catch {
      return;
    }
    if (f.type === 'snapshot' && f.state) {
      for (const [k, v] of Object.entries(f.state)) this.emit(kvToEvent(k, v));
    } else if (f.type === 'put' && f.key) {
      this.emit(kvToEvent(f.key, f.value ?? {}));
    } else if (f.type === 'delete' && f.key?.startsWith('wire_')) {
      this.emit({ type: 'wire', device: f.key.slice(5), on: false });
    }
  }
  private emit(ev: RigSyncEvent | null): void {
    if (ev) for (const cb of this.subs) cb(ev);
  }

  send(ev: RigSyncEvent): void {
    const kv = eventToKV(ev);
    if (!kv) return;
    const existing = this.pending.get(kv.key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      const p = this.pending.get(kv.key);
      this.pending.delete(kv.key);
      void fetch(`/api/rooms/${this.room}/${kv.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p?.value ?? kv.value),
      }).catch(() => {});
    }, 80);
    this.pending.set(kv.key, { value: kv.value, timer });
  }

  onEvent(cb: (ev: RigSyncEvent) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  dispose(): void {
    this.closed = true;
    this.subs.clear();
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
