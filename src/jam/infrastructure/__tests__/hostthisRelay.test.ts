import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HostthisRelaySync, eventToKV, kvToEvent } from '../hostthisRelay';
import type { RigSyncEvent } from '../../../rig/rigSync';
import { GONE_MS } from '../../domain/jam';

// The relay is a KV store, so RigSyncEvents translate to KV keys/values and back. Pin the round-trip.
describe('hostthis relay KV translation', () => {
  it('transport <-> the transport key', () => {
    const kv = eventToKV({ type: 'transport', running: true, bpm: 128 });
    expect(kv).toEqual({ key: 'transport', value: { running: true, bpm: 128 } });
    expect(kvToEvent('transport', { running: true, bpm: 128 })).toEqual({ type: 'transport', running: true, bpm: 128 });
  });

  it('drops a transport value without a numeric bpm', () => {
    expect(kvToEvent('transport', { running: true })).toBeNull();
    expect(kvToEvent('transport', { running: true, bpm: '120' })).toBeNull();
  });

  it('wire <-> a per-device key', () => {
    const kv = eventToKV({ type: 'wire', device: 'styloclone', on: true });
    expect(kv).toEqual({ key: 'wire_styloclone', value: { on: true } });
    expect(kvToEvent('wire_styloclone', { on: true })).toEqual({ type: 'wire', device: 'styloclone', on: true });
  });

  it('presence <-> a per-peer key', () => {
    const kv = eventToKV({ type: 'presence', peer: 'p1', holding: 'trb0b' });
    expect(kv).toEqual({ key: 'presence_p1', value: { holding: 'trb0b', at: expect.any(Number) } });
    expect(kvToEvent('presence_p1', { holding: 'trb0b' })).toEqual({ type: 'presence', peer: 'p1', holding: 'trb0b' });
  });

  it('the BroadcastChannel-only handshake events are not written to KV', () => {
    expect(eventToKV({ type: 'hello' } as RigSyncEvent)).toBeNull();
    expect(eventToKV({ type: 'snapshot', running: false, bpm: 120, wires: [] } as RigSyncEvent)).toBeNull();
  });

  it('an unknown KV key maps to nothing', () => {
    expect(kvToEvent('random', {})).toBeNull();
  });

  it('a non-object room value maps to nothing', () => {
    expect(kvToEvent('transport', null)).toBeNull();
    expect(kvToEvent('presence_p1', 'trb0b')).toBeNull();
  });

  it('a presence holding that is not a device id reads as holding nothing', () => {
    expect(kvToEvent('presence_p1', { holding: 7 })).toEqual({ type: 'presence', peer: 'p1', holding: null });
  });
});

// A socket the test drives: it records the instance so frames can be pushed in.
class FakeSocket {
  static last: FakeSocket | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: ((e: { data: string }) => void)[] = [];
  constructor() {
    FakeSocket.last = this;
  }
  addEventListener(_: string, cb: (e: { data: string }) => void) {
    this.listeners.push(cb);
  }
  close() {}
  frame(f: unknown) {
    for (const cb of this.listeners) cb({ data: JSON.stringify(f) });
  }
}

describe('HostthisRelaySync', () => {
  const puts: { url: string; method?: string; keepalive?: boolean; body?: unknown }[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    puts.length = 0;
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('location', { protocol: 'https:', host: 'app.example' });
    vi.stubGlobal('fetch', (url: string, init: { method?: string; keepalive?: boolean; body?: string }) => {
      puts.push({ url, method: init.method, keepalive: init.keepalive, body: init.body ? JSON.parse(init.body) : undefined });
      return Promise.resolve({ ok: true });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not hand our own write back to us when the room echoes it', () => {
    const sync = new HostthisRelaySync('room1');
    const got: RigSyncEvent[] = [];
    sync.onEvent((ev) => got.push(ev));
    sync.send({ type: 'transport', running: true, bpm: 100 });
    vi.advanceTimersByTime(100);
    expect(puts).toHaveLength(1);
    FakeSocket.last!.frame({ type: 'put', key: 'transport', value: puts[0].body }); // the echo
    expect(got).toEqual([]);
    FakeSocket.last!.frame({ type: 'put', key: 'transport', value: { running: false, bpm: 90, from: 'someone-else' } });
    expect(got).toEqual([{ type: 'transport', running: false, bpm: 90 }]);
    sync.dispose();
  });

  it('skips presence a join snapshot replays from peers that left long ago', () => {
    const sync = new HostthisRelaySync('room1');
    const got: RigSyncEvent[] = [];
    sync.onEvent((ev) => got.push(ev));
    FakeSocket.last!.frame({
      type: 'snapshot',
      state: {
        presence_gone: { holding: 'hiclone', at: Date.now() - GONE_MS - 1 },
        presence_legacy: { holding: 'trb0b' },
        presence_here: { holding: 'loopclone', at: Date.now() - 1000 },
      },
    });
    expect(got).toEqual([{ type: 'presence', peer: 'here', holding: 'loopclone' }]);
    sync.dispose();
  });

  it('a deleted presence key is that peer leaving', () => {
    const sync = new HostthisRelaySync('room1');
    const got: RigSyncEvent[] = [];
    sync.onEvent((ev) => got.push(ev));
    FakeSocket.last!.frame({ type: 'delete', key: 'presence_p9' });
    expect(got).toEqual([{ type: 'leave', peer: 'p9' }]);
    sync.dispose();
  });

  it('leaving deletes our own presence key, surviving a closing tab', () => {
    const sync = new HostthisRelaySync('room1');
    sync.dispose();
    expect(puts).toEqual([{ url: `/api/rooms/room1/presence_${sync.self}`, method: 'DELETE', keepalive: true, body: undefined }]);
  });
});

