import { describe, it, expect } from 'vitest';
import { emptyJam, holderOf, canClaim, claim, release, upsertMember, pruneMembers, claimWinner, GONE_MS } from '../jam';

describe('Jam presence (hard-lock occupancy)', () => {
  it('starts with just self, holding nothing', () => {
    const j = emptyJam('room1', 'me', 'Me', 0);
    expect(Object.keys(j.members)).toEqual(['me']);
    expect(j.members.me.holding).toBeNull();
  });

  it('claiming a free device grabs it; the holder is reported', () => {
    let j = emptyJam('r', 'me', 'Me', 0);
    j = claim(j, 'me', 'hiclone', 10);
    expect(j.members.me.holding).toBe('hiclone');
    expect(holderOf(j, 'hiclone')).toBe('me');
  });

  it('hard-lock: cannot claim a device someone else holds', () => {
    let j = emptyJam('r', 'me', 'Me', 0);
    j = upsertMember(j, { peerId: 'you', name: 'You', holding: 'hiclone', lastSeen: 5 });
    expect(canClaim(j, 'me', 'hiclone')).toBe(false);
    j = claim(j, 'me', 'hiclone', 10); // no-op
    expect(holderOf(j, 'hiclone')).toBe('you');
    expect(j.members.me.holding).toBeNull();
  });

  it('claiming a second device drops the first', () => {
    let j = emptyJam('r', 'me', 'Me', 0);
    j = claim(j, 'me', 'hiclone', 10);
    j = claim(j, 'me', 'trb0b', 20);
    expect(j.members.me.holding).toBe('trb0b');
    expect(holderOf(j, 'hiclone')).toBeNull();
  });

  it('release frees the device', () => {
    let j = emptyJam('r', 'me', 'Me', 0);
    j = claim(j, 'me', 'hiclone', 10);
    j = release(j, 'me', 20);
    expect(holderOf(j, 'hiclone')).toBeNull();
  });

  it('a claim race resolves to the lowest peer-id', () => {
    expect(claimWinner('aaa', 'bbb')).toBe('aaa');
    expect(claimWinner('zzz', 'aaa')).toBe('aaa');
  });

  it('prunes members with a stale heartbeat, never self', () => {
    let j = emptyJam('r', 'me', 'Me', 0);
    j = upsertMember(j, { peerId: 'gone', name: 'Gone', holding: 'trb0b', lastSeen: 0 });
    j = pruneMembers(j, GONE_MS + 1);
    expect(Object.keys(j.members)).toEqual(['me']); // 'gone' dropped, self kept even at lastSeen 0
    expect(holderOf(j, 'trb0b')).toBeNull(); // its device is freed
  });
});
