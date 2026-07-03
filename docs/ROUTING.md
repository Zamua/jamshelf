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

## Phases (all shipped 2026-07-03)

1. **Shared audio bus** ✓ - `RigAudio` + the `SharedAudio` port; every instrument runs on the one
   shared context and outputs to its jack. (Foundation - nothing routes without it.)
2. **LoopClone engine** ✓ - `loopEngine.ts` taps the input bus, per-track record/play/overdub,
   mute/solo/fader/clear, undo, quantized to the beat. Big button = record/play/overdub (hold = solo);
   stop = mute (hold = clear); faders drag to level; top-panel ALL = start/stop all, UNDO = last take.
3. **Virtual wires** ✓ - `PatchLayer.tsx`: a "wire" mode in the rig all-view. Tapping it turns off the
   device tap-to-focus catchers, so tapping a device's output jack patches it into the looper (a cable
   arcs to the looper's input socket; tap again to unplug). Persisted as `RigConfig.wires`, mirrored
   into `RigAudio.wire/unwire`.

Interaction note: patching is **tap-to-connect** (in wire mode), NOT drag. The desk is top-down and
each device carries a large invisible tap-to-focus catcher sphere; a drag-from-jack fought that
catcher and the perspective parallax made a lifted hit-target drift off the visible jack. Wire mode
(catchers off) + tap is the robust version. A true drag-cable is a possible later refinement.

Later polish (not yet): multiplayer sync of the patch + the loop buffers, sample-tight loop/beat
alignment (currently within one audio buffer), the transport-button (TAP/RUN) repurpose, redo affordance.
