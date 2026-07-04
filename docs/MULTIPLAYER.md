# Multiplayer jam rooms (in progress)

Each rig `/rig/<uuid>` is a shared session: several people jam on ONE rig, the uuid is the room. The
whole thing is **peer-to-peer, no backend** (jamshelf is local-only): no server owns the state, peers
sync directly. Design settled 2026-07-03 (see docs/RIG.md); this doc is the sync architecture.

## What is shared, and how conflicts are avoided

The occupancy model makes the state conflict-free by construction (this is the key idea):

- **One player per instrument, hard-lock.** You grab an instrument (tap to focus it); while you hold
  it nobody else can. Releasing (back button, disconnect, or ~1 min idle) frees it. So each device has
  a **single writer** at any moment - no merge conflicts on a device's state.
- **The device owns the memory, not the player.** Your sequence/loops stay on the device when you
  leave; the next person to grab it inherits them. State is keyed by device, not by who made it.
- **Transport behaves identically solo and multiplayer** (a shared beat grid, no master - Ableton-Link
  style): tempo + play/stop + phase. Everyone locks to the same grid.

So the synced state is: **transport** (tempo/run/phase), **the patch** (`RigConfig.wires`), **per-device
memory** (each instrument's settings + the looper's loops), and **presence** (who holds what + idle).
Each item has a single writer (the transport bar operator broadcasts; a device's holder broadcasts its
device), so applying a remote update is a straight overwrite - no CRDT/OT needed.

## The sync layer (`src/rig/rigSync.ts`)

A narrow port so the app doesn't care about the wire transport:

```
interface RigSync {
  send(ev: RigSyncEvent): void;          // broadcast to the room
  onEvent(cb: (ev) => void): () => void; // remote events (never your own)
  readonly self: string;                 // this peer's id
  dispose(): void;
}
```

`RigSyncEvent` is a tagged union: `transport` (running/bpm/epoch), `wire` (toggle a patch), `presence`
(claim/release a device + heartbeat), `deviceState` (a device's serialized memory), `loop` (a track's
PCM). Applying a remote event sets a `applyingRemote` guard so it does NOT re-broadcast (no echo loop).

Two adapters behind the port:

1. **`BroadcastChannelSync`** - same-device, multiple tabs. Real, working multiplayer for two tabs on
   one machine (shared wall clock, so the transport phase-locks trivially). This is what's built first:
   it exercises the whole sync WIRING without any networking, and is genuinely useful for testing.
2. **`WebRtcSync`** - cross-device, over WebRTC data channels (unreliable+unordered for position beats,
   reliable+ordered for state). This is the real multiplayer. **The open decision:** WebRTC needs a
   SIGNALING rendezvous to exchange SDP/ICE, and "no backend" rules out our own signaling server.
   Options: (a) a public signaling broker (e.g. PeerJS's public server) - not our backend but an
   external dependency; (b) manual copy-paste of the offer/answer (truly zero-infra, clunky); (c) a
   public relay (a free MQTT/WebSocket broker) as the rendezvous. Cross-device clock skew (for phase)
   is the other WebRTC-only problem - Ableton Link solves it with a clock-sync handshake; same-device
   (BroadcastChannel) has none. **This needs the operator's call before building the WebRTC adapter.**

## Presence + occupancy

A `presence` heartbeat (~every few sec) carries `{peer, holding: deviceId|null}`. Claiming: on focus,
broadcast a claim; if two claims race, lowest peer-id wins (deterministic) and the loser bounces back
to the all-view. Release: on back/disconnect (heartbeat gap > ~10s) / idle (>~60s no input). The device
is then free for anyone to grab. Rendered as a colored presence chip on each held device.

## Phases

1. **Sync layer + local multiplayer** - `RigSync` port + `BroadcastChannelSync`; wire the transport
   (play/stop/tempo) so two tabs stay locked. ← current
2. **Patch + presence** - sync `wires` toggles + the presence/claim/release + the presence chips.
3. **Per-device memory + loops** - broadcast a device's serialized state on change; the looper streams
   its track PCM (chunked) so a joiner hears the loops.
4. **WebRTC adapter** - the cross-device transport (pending the signaling decision) + clock-sync for phase.
