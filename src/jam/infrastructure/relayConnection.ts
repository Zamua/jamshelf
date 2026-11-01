// The relay's socket lifecycle, pure: one connection at a time, exponential backoff with jitter
// between attempts, and an immediate retry when the page wakes (visible again, back online).

export type Connection =
  | { readonly kind: 'connecting'; readonly attempt: number }
  | { readonly kind: 'open' }
  | { readonly kind: 'waiting'; readonly attempt: number } // backing off before the next attempt
  | { readonly kind: 'closed' }; // disposed, for good

export type ConnectionEvent =
  | { readonly type: 'opened' }
  | { readonly type: 'dropped' } // the socket closed or failed
  | { readonly type: 'retryDue' }
  | { readonly type: 'wake' } // the page became visible or came back online
  | { readonly type: 'dispose' };

export type ConnectionEffect =
  | { readonly kind: 'connect' }
  | { readonly kind: 'retryIn'; readonly ms: number }
  | { readonly kind: 'cancelRetry' }
  | { readonly kind: 'flush' } // resend the writes that failed while the room was unreachable
  | { readonly kind: 'disconnect' };

export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 15_000;

// The wait before attempt n (n >= 1): doubling from the base, capped, then jittered to 50-100% so a
// room's peers do not all reconnect in the same instant. `rand` is in [0, 1).
export function backoffMs(attempt: number, rand: number): number {
  const ceiling = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
  return ceiling * (0.5 + rand * 0.5);
}

export const firstConnection: Connection = { kind: 'connecting', attempt: 0 };

export function nextConnection(c: Connection, e: ConnectionEvent, rand: number): { connection: Connection; effects: ConnectionEffect[] } {
  const stay = { connection: c, effects: [] };
  if (c.kind === 'closed') return stay;
  switch (e.type) {
    case 'dispose':
      return { connection: { kind: 'closed' }, effects: c.kind === 'waiting' ? [{ kind: 'cancelRetry' }, { kind: 'disconnect' }] : [{ kind: 'disconnect' }] };
    case 'opened':
      return c.kind === 'connecting' ? { connection: { kind: 'open' }, effects: [{ kind: 'flush' }] } : stay;
    case 'dropped': {
      if (c.kind === 'waiting') return stay;
      const attempt = c.kind === 'connecting' ? c.attempt + 1 : 1;
      return { connection: { kind: 'waiting', attempt }, effects: [{ kind: 'retryIn', ms: backoffMs(attempt, rand) }] };
    }
    case 'retryDue':
      return c.kind === 'waiting' ? { connection: { kind: 'connecting', attempt: c.attempt }, effects: [{ kind: 'connect' }] } : stay;
    case 'wake':
      // only a connection that is backing off has anything to gain from trying now
      return c.kind === 'waiting'
        ? { connection: { kind: 'connecting', attempt: c.attempt }, effects: [{ kind: 'cancelRetry' }, { kind: 'connect' }] }
        : stay;
  }
}
