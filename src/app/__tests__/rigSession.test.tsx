// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useRigSession } from '../rigSession';
import { Transport } from '../../transport/transport';
import type { RigAudio } from '../../rig/rigAudio';
import type { RigSync, RigSyncEvent } from '../../rig/rigSync';
import type { RigConfig } from '../../rig/rigStore';

// A sync channel the test steers: records sends, delivers remote events, knows if it was disposed.
class FakeSync implements RigSync {
  readonly self = 'me';
  readonly sent: RigSyncEvent[] = [];
  disposed = false;
  private subs = new Set<(ev: RigSyncEvent) => void>();
  send(ev: RigSyncEvent): void {
    this.sent.push(ev);
  }
  onEvent(cb: (ev: RigSyncEvent) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  deliver(ev: RigSyncEvent): void {
    for (const cb of this.subs) cb(ev);
  }
  get listening(): boolean {
    return this.subs.size > 0;
  }
  dispose(): void {
    this.disposed = true;
  }
}

const rig: RigConfig = { instruments: ['hiclone'], placements: { hiclone: { x: 0, z: 0, yaw: 0 } } };
const audio = { wire() {}, unwire() {} } as unknown as RigAudio;

function mount(strict = false) {
  const syncs: FakeSync[] = [];
  const transport = new Transport();
  const connect = () => {
    const s = new FakeSync();
    syncs.push(s);
    return s;
  };
  renderHook(() => useRigSession({ rig, rigUuid: 'r1', live: true, audio, transport, focused: null, onFocus: () => {}, connect }), {
    wrapper: strict ? StrictMode : undefined,
  });
  // the channel the session is subscribed to right now
  const live = () => syncs.filter((s) => s.listening);
  return { syncs, live, transport };
}

afterEach(() => cleanup());

describe('useRigSession', () => {
  it('keeps broadcasting local changes after applying a remote event threw', () => {
    const { live, transport } = mount();
    const sync = live()[0];
    const off = transport.onChange(() => {
      throw new Error('a listener broke');
    });
    expect(() => act(() => sync.deliver({ type: 'transport', state: 'paused', bpm: 90 }))).toThrow();
    off();
    act(() => transport.setBpm(130));
    expect(sync.sent).toContainEqual({ type: 'transport', state: 'stopped', bpm: 130 });
  });

  it('under StrictMode the session listens on one channel, and it is not a disposed one', () => {
    const { live, transport } = mount(true);
    expect(live()).toHaveLength(1);
    expect(live()[0].disposed).toBe(false);
    act(() => live()[0].deliver({ type: 'transport', state: 'paused', bpm: 95 }));
    expect(transport.getBpm()).toBe(95);
  });

  it('a peer STOP rewinds us to bar 1, a peer PAUSE holds our place', () => {
    const { live, transport } = mount();
    const sync = live()[0];
    act(() => transport.play());
    for (let i = 0; i < 200; i++) transport.advance();
    act(() => sync.deliver({ type: 'transport', state: 'paused', bpm: 120 }));
    expect(transport.state()).toBe('paused');
    expect(transport.position().bar).toBe(3);
    act(() => sync.deliver({ type: 'transport', state: 'stopped', bpm: 120 }));
    expect(transport.state()).toBe('stopped');
    expect(transport.position().bar).toBe(1);
  });
});

