import { describe, it, expect } from 'vitest';
import { RigAudio } from '../rigAudio';

// A minimal fake Web Audio graph: nodes just track what they're connected to, so the wire/unwire
// bookkeeping is testable without a real AudioContext.
class FakeNode {
  readonly connections = new Set<FakeNode>();
  connect(n: FakeNode) {
    this.connections.add(n);
  }
  disconnect(n?: FakeNode) {
    if (n) this.connections.delete(n);
    else this.connections.clear();
  }
}
class FakeCtx {
  destination = new FakeNode();
  createGain() {
    return new FakeNode();
  }
}
const fakeCtx = () => new FakeCtx() as unknown as AudioContext;

describe('RigAudio', () => {
  it('gives each device ONE output jack (cached), feeding the master', () => {
    const ra = new RigAudio(fakeCtx());
    const a = ra.output('hiclone');
    const b = ra.output('hiclone');
    expect(a).toBe(b); // same jack per device
    expect(ra.output('trb0b')).not.toBe(a);
  });

  it('wire() patches a device into the looper input; idempotent', () => {
    const ra = new RigAudio(fakeCtx());
    expect(ra.isWired('hiclone')).toBe(false);
    ra.wire('hiclone');
    ra.wire('hiclone'); // idempotent
    expect(ra.isWired('hiclone')).toBe(true);
    const jack = ra.output('hiclone') as unknown as FakeNode;
    expect(jack.connections.has(ra.looperInput as unknown as FakeNode)).toBe(true);
  });

  it('unwire() removes the patch', () => {
    const ra = new RigAudio(fakeCtx());
    ra.wire('hiclone');
    ra.unwire('hiclone');
    ra.unwire('hiclone'); // idempotent
    expect(ra.isWired('hiclone')).toBe(false);
    const jack = ra.output('hiclone') as unknown as FakeNode;
    expect(jack.connections.has(ra.looperInput as unknown as FakeNode)).toBe(false);
  });

  it('tracks the set of wired devices', () => {
    const ra = new RigAudio(fakeCtx());
    ra.wire('trb0b');
    ra.wire('styloclone');
    expect([...ra.wiredDevices()].sort()).toEqual(['styloclone', 'trb0b']);
    ra.unwire('trb0b');
    expect(ra.wiredDevices()).toEqual(['styloclone']);
  });
});
