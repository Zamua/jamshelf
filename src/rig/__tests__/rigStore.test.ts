import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRig, listRigs, loadRig, deleteRig, updateRig, saveWires, parseRigConfig } from '../rigStore';

// A tiny in-memory localStorage so the store's persistence is testable without a browser.
class MemLS {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  key(i: number): string | null {
    return [...this.store.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
}

// A legal rig: every instrument has a placement.
const at = (...ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, { x: i * 3, z: 0, yaw: 0 }]));

describe('rigStore CRUD', () => {
  let clock = 1000;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = new MemLS();
    clock = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10)); // monotonic for a deterministic sort
  });

  it('creates + loads a rig, stamping created/updated', () => {
    const id = createRig(['hiclone', 'trb0b'], at('hiclone', 'trb0b'));
    const c = loadRig(id);
    expect(c?.instruments).toEqual(['hiclone', 'trb0b']);
    expect(c?.createdAt).toBeGreaterThan(0);
    expect(c?.updatedAt).toBeGreaterThan(0);
  });

  it('lists rigs most-recently-touched first', () => {
    const a = createRig(['hiclone'], at('hiclone'));
    const b = createRig(['trb0b'], at('trb0b'));
    const list = listRigs();
    expect(list.map((r) => r.uuid)).toEqual([b, a]); // b created later -> first
    expect(list[0].instruments).toEqual(['trb0b']);
  });

  it('deletes a rig (idempotent)', () => {
    const id = createRig(['hiclone'], at('hiclone'));
    deleteRig(id);
    expect(loadRig(id)).toBeNull();
    expect(listRigs()).toHaveLength(0);
    deleteRig(id); // no throw on a missing key
  });

  it('updateRig replaces instruments + placements, preserves createdAt, bumps updatedAt', () => {
    const id = createRig(['hiclone'], { hiclone: { x: 0, z: 0, yaw: 0 } });
    const created = loadRig(id)!;
    updateRig(id, ['hiclone', 'trb0b'], { hiclone: { x: 0, z: 0, yaw: 0 }, trb0b: { x: 2, z: 0, yaw: 0 } });
    const updated = loadRig(id)!;
    expect(updated.instruments).toEqual(['hiclone', 'trb0b']);
    expect(updated.createdAt).toBe(created.createdAt); // preserved
    expect(updated.updatedAt!).toBeGreaterThan(created.updatedAt!); // bumped
  });

  it('updateRig keeps patch cables of devices still in the rig', () => {
    const id = createRig(['hiclone', 'trb0b', 'loopclone'], at('hiclone', 'trb0b', 'loopclone'));
    saveWires(id, ['hiclone', 'trb0b']);
    updateRig(id, ['hiclone', 'loopclone'], at('hiclone', 'loopclone'));
    expect(loadRig(id)?.wires).toEqual(['hiclone']);
  });

  it('listRigs ignores non-rig localStorage keys', () => {
    createRig(['hiclone'], at('hiclone'));
    localStorage.setItem('jamshelf/hiclone/settings', '{"bpm":120}');
    localStorage.setItem('unrelated', 'x');
    expect(listRigs()).toHaveLength(1);
  });
});

describe('parseRigConfig', () => {
  const p = { x: 0, z: 1, yaw: 0.2 };

  it('accepts a well-formed rig and drops wires to devices outside it', () => {
    expect(parseRigConfig({ instruments: ['hiclone'], placements: { hiclone: p }, wires: ['hiclone', 'trb0b'] })).toEqual({
      instruments: ['hiclone'],
      placements: { hiclone: p },
      wires: ['hiclone'],
      createdAt: undefined,
      updatedAt: undefined,
    });
  });

  it('rejects a rig with no instruments or a missing placement', () => {
    expect(parseRigConfig({ instruments: [], placements: {} })).toBeNull();
    expect(parseRigConfig({ instruments: ['hiclone', 'trb0b'], placements: { hiclone: p } })).toBeNull();
    expect(parseRigConfig(null)).toBeNull();
    expect(parseRigConfig('rig')).toBeNull();
  });

  it('rejects non-finite or non-numeric placement values', () => {
    expect(parseRigConfig({ instruments: ['hiclone'], placements: { hiclone: { x: null, z: 0, yaw: 0 } } })).toBeNull();
    expect(parseRigConfig({ instruments: ['hiclone'], placements: { hiclone: { x: '1', z: 0, yaw: 0 } } })).toBeNull();
  });
});
