# Routing + the LoopClone audio (in progress)

The LoopClone records + loops the OTHER instruments. Since Web Audio can't connect nodes across
separate `AudioContext`s, and every instrument makes its own today, the whole feature rests on ONE
shared context for the rig. The user's model (settled 2026-07-03): virtual wires plug devices into
the looper's input bus, and recording is TEMPORAL - a track captures whatever's playing on the
plugged-in sources when you hit record (faithful to the RC-505, which records "the input", not a
per-track patch).

## The shared audio graph (`src/rig/rigAudio.ts`)

One `AudioContext` for the rig. Each device gets its OWN output node (its "output jack"); that node
feeds the master (→ speakers) AND, when a wire connects it, the looper's input bus:

```
HiClone ─┐
StyloClone ─┼─ deviceOut(id) ──▶ master ──▶ destination
TR-B0B ─┘        │  (a wire also connects it ▼)
                 └────────────────────▶ looperInput ──▶ [LoopClone engine: tap → tracks]
                                                              track gains ──▶ master
```

- `RigAudio.output(deviceId)` - the device's output jack (created once, → master, tappable).
- `RigAudio.wire(deviceId)` / `unwire(deviceId)` - a virtual wire: join/leave a device's output on
  the looper's input bus. Idempotent. The set of wired devices persists with the rig + syncs.
- `RigAudio.looperInput` - the bus the LoopClone engine taps to record.

Instruments take a `SharedAudio` (`{ ctx, output(id) }`) and use `ctx` + connect their limiter to
`output(id)` instead of `ctx.destination`. Solo is a rig of one: still one shared context.

## The LoopClone engine (`infrastructure/audio/`)

Taps `looperInput` (a ScriptProcessor tap, like the HiClone looper taps its live bus), records the
bus into per-track stereo buffers on the beat grid (quantize to bars via the shared Transport), plays
each track through its own gain (fader level × mute × solo). Per track: record → play → overdub,
mute (phase-preserving silence), solo (mute the rest), clear, and undo/redo (a bounded stack of the
track's buffer states, so an overdub or a record can be undone).

## The wires (UI)

3D cables on the desk: drag from a device's output jack to the looper's input jack. Small number of
set-once connections (not a full modular patchbay), so the mobile drag stays sane. The patch is rig
state (`rigStore`), shared in multiplayer. `RigAudio.wire/unwire` applies the audio side.

## Phases

1. **Shared audio bus** - `RigAudio` + the `SharedAudio` port; refactor each instrument to accept it
   and output to its jack. (Foundation - nothing routes without it.) ← current
2. **LoopClone engine** - tap the input bus, per-track record/play/overdub, mute/solo/fader/clear,
   undo-redo, quantized. Wire the device's big buttons + ALL + faders to it.
3. **Virtual wires** - the drag-cable UI + persistence + the `RigAudio.wire` hookup.
4. **Polish** - solo/undo affordances, multiplayer sync of the patch, the transport-button repurpose.
