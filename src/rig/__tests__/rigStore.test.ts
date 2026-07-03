import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRig, listRigs, loadRig, deleteRig, updateRig } from '../rigStore';

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

describe('rigStore CRUD', () => {
  let clock = 1000;
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = new MemLS();
    clock = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += 10)); // monotonic for a deterministic sort
  });

  it('creates + loads a rig, stamping created/updated', () => {
    const id = createRig(['hiclone', 'trb0b'], { hiclone: { x: 0, z: 0, yaw: 0 } });
    const c = loadRig(id);
    expect(c?.instruments).toEqual(['hiclone', 'trb0b']);
    expect(c?.createdAt).toBeGreaterThan(0);
    expect(c?.updatedAt).toBeGreaterThan(0);
  });

  it('lists rigs most-recently-touched first', () => {
    const a = createRig(['hiclone'], {});
    const b = createRig(['trb0b'], {});
    const list = listRigs();
    expect(list.map((r) => r.uuid)).toEqual([b, a]); // b created later -> first
    expect(list[0].instruments).toEqual(['trb0b']);
  });

  it('deletes a rig (idempotent)', () => {
    const id = createRig(['hiclone'], {});
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

  it('listRigs ignores non-rig localStorage keys', () => {
    createRig(['hiclone'], {});
    localStorage.setItem('jamshelf/hiclone/settings', '{"bpm":120}');
    localStorage.setItem('unrelated', 'x');
    expect(listRigs()).toHaveLength(1);
  });
});
