import { describe, it, expect } from 'vitest';
import { BACKOFF_MAX_MS, backoffMs, firstConnection, nextConnection, type Connection, type ConnectionEvent } from '../relayConnection';

function run(events: ConnectionEvent[], from: Connection = firstConnection, rand = 1 - 1e-9) {
  let c = from;
  const fx: unknown[] = [];
  for (const e of events) {
    const t = nextConnection(c, e, rand);
    c = t.connection;
    fx.push(...t.effects);
  }
  return { c, fx };
}

describe('relay connection', () => {
  it('backs off doubling from 500 ms up to the cap, jittered to 50-100%', () => {
    expect(backoffMs(1, 0)).toBe(250);
    expect(backoffMs(1, 1)).toBe(500);
    expect(backoffMs(3, 1)).toBe(2000);
    expect(backoffMs(20, 1)).toBe(BACKOFF_MAX_MS);
  });

  it('opening flushes owed writes; a drop waits, then retries', () => {
    const { c, fx } = run([{ type: 'opened' }, { type: 'dropped' }, { type: 'retryDue' }]);
    expect(c).toEqual({ kind: 'connecting', attempt: 1 });
    expect(fx).toEqual([{ kind: 'flush' }, { kind: 'retryIn', ms: expect.closeTo(500, 1) }, { kind: 'connect' }]);
  });

  it('each failed attempt waits longer; a success resets the count', () => {
    const failing = run([{ type: 'dropped' }, { type: 'retryDue' }, { type: 'dropped' }]);
    expect(failing.c).toEqual({ kind: 'waiting', attempt: 2 });
    const healed = run([{ type: 'retryDue' }, { type: 'opened' }, { type: 'dropped' }], failing.c);
    expect(healed.c).toEqual({ kind: 'waiting', attempt: 1 });
  });

  it('waking the page skips the wait; it does nothing to a live or connecting socket', () => {
    const waiting = run([{ type: 'dropped' }]).c;
    expect(run([{ type: 'wake' }], waiting).fx).toEqual([{ kind: 'cancelRetry' }, { kind: 'connect' }]);
    expect(run([{ type: 'opened' }, { type: 'wake' }]).fx).toEqual([{ kind: 'flush' }]);
    expect(run([{ type: 'wake' }]).fx).toEqual([]);
  });

  it('a stray event from the wrong phase is ignored', () => {
    expect(run([{ type: 'retryDue' }]).fx).toEqual([]);
    const waiting = run([{ type: 'dropped' }]).c;
    expect(run([{ type: 'dropped' }, { type: 'opened' }], waiting).c).toBe(waiting);
  });

  it('dispose is final, and cancels a pending retry', () => {
    const waiting = run([{ type: 'dropped' }]).c;
    const disposed = run([{ type: 'dispose' }], waiting);
    expect(disposed.fx).toEqual([{ kind: 'cancelRetry' }, { kind: 'disconnect' }]);
    expect(run([{ type: 'wake' }, { type: 'retryDue' }, { type: 'opened' }], disposed.c).fx).toEqual([]);
  });
});
