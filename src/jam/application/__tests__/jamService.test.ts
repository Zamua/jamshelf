import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JamService } from '../jamService';
import { IDLE_MS } from '../../domain/jam';
import type { RigSync, RigSyncEvent } from '../../../rig/rigSync';

// An in-memory RigSync: records what this peer sends, lets the test deliver remote events.
class FakeSync implements RigSync {
  readonly sent: RigSyncEvent[] = [];
  private subs = new Set<(ev: RigSyncEvent) => void>();
  readonly self: string;
  constructor(self: string) {
    this.self = self;
  }
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
  lastPresence() {
    return [...this.sent].reverse().find((e) => e.type === 'presence');
  }
  dispose(): void {}
}

describe('JamService occupancy', () => {
  let sync: FakeSync;
  let svc: JamService;
  let lost: number;
  beforeEach(() => {
    vi.useFakeTimers();
    sync = new FakeSync('bbb');
    svc = new JamService('room', sync);
    lost = 0;
    svc.onLost(() => lost++);
  });
  afterEach(() => {
    svc.dispose();
    vi.useRealTimers();
  });

  it('loses a simultaneous claim to a lower peer id and announces the release', () => {
    svc.claim('hiclone');
    sync.deliver({ type: 'presence', peer: 'aaa', holding: 'hiclone' });
    expect(lost).toBe(1);
    expect(svc.holderOf('hiclone')).toBe('aaa');
    expect(sync.lastPresence()).toEqual({ type: 'presence', peer: 'bbb', holding: null });
  });

  it('keeps a simultaneous claim against a higher peer id', () => {
    svc.claim('hiclone');
    sync.deliver({ type: 'presence', peer: 'ccc', holding: 'hiclone' });
    expect(lost).toBe(0);
    expect(svc.holderOf('hiclone')).toBe('bbb');
  });

  it('ignores its own presence echoed back by the relay', () => {
    svc.claim('hiclone');
    sync.deliver({ type: 'presence', peer: 'bbb', holding: null });
    expect(svc.holderOf('hiclone')).toBe('bbb');
  });

  it('releases the device after IDLE_MS without input', () => {
    svc.claim('hiclone');
    vi.advanceTimersByTime(IDLE_MS + 5_000);
    expect(lost).toBe(1);
    expect(svc.holderOf('hiclone')).toBeNull();
  });

  it('input holds off the idle release', () => {
    svc.claim('hiclone');
    for (let t = 0; t < 3; t++) {
      vi.advanceTimersByTime(IDLE_MS / 2);
      svc.touch();
    }
    expect(lost).toBe(0);
    expect(svc.holderOf('hiclone')).toBe('bbb');
  });

  it('a peer that leaves frees its device at once', () => {
    sync.deliver({ type: 'presence', peer: 'aaa', holding: 'hiclone' });
    expect(svc.canClaim('hiclone')).toBe(false);
    sync.deliver({ type: 'leave', peer: 'aaa' });
    expect(svc.canClaim('hiclone')).toBe(true);
    expect(Object.keys(svc.view().members)).toEqual(['bbb']);
  });

  it('a refused claim tells the UI to drop its focus', () => {
    sync.deliver({ type: 'presence', peer: 'aaa', holding: 'hiclone' });
    svc.claim('hiclone');
    expect(lost).toBe(1);
    expect(svc.holderOf('hiclone')).toBe('aaa');
  });
});

