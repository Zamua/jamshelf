import { describe, it, expect } from 'vitest';
import { parseRoute, rigUuidOf } from '../route';

const known = (id: string) => id === 'hiclone';

describe('parseRoute', () => {
  it('maps each URL shape to its mode', () => {
    expect(parseRoute('/', known)).toEqual({ kind: 'shelf' });
    expect(parseRoute('/hiclone', known)).toEqual({ kind: 'single', id: 'hiclone' });
    expect(parseRoute('/rig/ab12cd34', known)).toEqual({ kind: 'rig', uuid: 'ab12cd34' });
    const room = '0b7a3c1e-1234-4abc-8def-0123456789ab';
    expect(parseRoute(`/jam/${room}`, known)).toEqual({ kind: 'jam', uuid: room });
  });

  it('anything else is bad', () => {
    expect(parseRoute('/hichord', known)).toEqual({ kind: 'bad' });
    expect(parseRoute('/jam/not-a-room', known)).toEqual({ kind: 'bad' });
    expect(parseRoute('/rig/', known)).toEqual({ kind: 'bad' });
  });

  it('a jam plays the rig stored under its room id', () => {
    expect(rigUuidOf({ kind: 'jam', uuid: 'r1' })).toBe('r1');
    expect(rigUuidOf({ kind: 'single', id: 'hiclone' })).toBeNull();
  });
});
