import { describe, it, expect } from 'vitest';
import { eventToKV, kvToEvent } from '../hostthisRelay';
import type { RigSyncEvent } from '../../../rig/rigSync';

// The relay is a KV store, so RigSyncEvents translate to KV keys/values and back. Pin the round-trip.
describe('hostthis relay KV translation', () => {
  it('transport <-> the transport key', () => {
    const kv = eventToKV({ type: 'transport', running: true, bpm: 128 });
    expect(kv).toEqual({ key: 'transport', value: { running: true, bpm: 128 } });
    expect(kvToEvent('transport', { running: true, bpm: 128 })).toEqual({ type: 'transport', running: true, bpm: 128 });
  });

  it('wire <-> a per-device key', () => {
    const kv = eventToKV({ type: 'wire', device: 'styloclone', on: true });
    expect(kv).toEqual({ key: 'wire_styloclone', value: { on: true } });
    expect(kvToEvent('wire_styloclone', { on: true })).toEqual({ type: 'wire', device: 'styloclone', on: true });
  });

  it('presence <-> a per-peer key', () => {
    const kv = eventToKV({ type: 'presence', peer: 'p1', holding: 'trb0b' });
    expect(kv).toEqual({ key: 'presence_p1', value: { holding: 'trb0b' } });
    expect(kvToEvent('presence_p1', { holding: 'trb0b' })).toEqual({ type: 'presence', peer: 'p1', holding: 'trb0b' });
  });

  it('the BroadcastChannel-only handshake events are not written to KV', () => {
    expect(eventToKV({ type: 'hello' } as RigSyncEvent)).toBeNull();
    expect(eventToKV({ type: 'snapshot', running: false, bpm: 120, wires: [] } as RigSyncEvent)).toBeNull();
  });

  it('an unknown KV key maps to nothing', () => {
    expect(kvToEvent('random', {})).toBeNull();
  });
});
