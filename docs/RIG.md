# Rigs + the shared Transport

How several instruments jam together, locked in time. Modeled on how real hardware syncs (DIN
sync / MIDI clock / Ableton Link) so a person used to physical gear needs no instruction.

## The core idea: two separate layers

Every hardware sync system separates two things, and so do we:

- **Timing** - a shared *clock* (the beat) plus *transport* (start / stop) plus *position*
  (where we are in the bar). This is what keeps everyone locked.
- **Notes** - the actual musical data (which chord, which drum, which key). Owned by each
  instrument, never shared.

"Sync" is almost entirely about the timing layer. The clock line is separate from the notes,
exactly like a DIN-sync cable or a MIDI clock stream.

## The Transport (the master clock)

`src/transport/` is a bounded context whose one job is timing. The `Transport` is a pure,
I/O-free domain object - a software DIN-sync master. It owns exactly:

- **tempo** - one BPM.
- **running** - is the clock advancing? Two standard halts (as on a tape deck / MIDI transport):
  **pause** holds position (the next play resumes from here); **stop** returns to bar 1 (the next
  play starts from the top). `play()` / `pause()` / `stop()`; `toggle()` is play/pause.
- **position** - a pulse counter at a base resolution (PPQN), from which `bar . beat . tick`
  and **phase** (position within the bar) are derived. Phase is what lets things line up on
  the downbeat.

The Transport advances its pulse counter as real time passes (driven by a `Ticker` port - an
interval adapter now, an AudioContext look-ahead scheduler later; the pure timing/quantize/phase
logic never touches I/O and is unit-tested). It hands each synced instrument a **Clock** - a view
that fires at that instrument's subdivision (a 16th for the drum machine, an 8th for an arp),
derived from the same pulse counter, so *phase-lock is automatic by construction*, not bolted on.

Base resolution: **24 PPQN** (as DIN sync and MIDI clock both use), which divides cleanly into
16ths (6 pulses), 8ths (12), and triplets (8).

## Instruments: synced vs free

Each instrument keeps its own bounded context (music theory, drum voices, sequencer pattern,
stylus). It relates to timing in exactly one of two ways:

- **Synced** (the TR-B0B sequencer, the HiClone arp / repeat / looper): consumes a `Clock` from
  the Transport. Its sequencer/arp advances on the Transport's ticks; its looper follows the
  Transport's position.
- **Free** (the StyloClone): gets no Clock. Played live, in real time, ignoring the beat.

An instrument never knows whether it is solo or in a rig - it just receives a `Clock` (or none).
That is the seam. **Solo is a rig of one:** a single instrument on the desk plays against its own
Transport, so there is one code path and no "rig mode vs solo mode" branching in the timing layer.

The `Clock` port (already shared by the instruments) is the contract:
`setBpm / setBeatsPerTick / start / stop / onTick`. In a rig, `start`/`stop` express whether the
instrument *wants* ticks right now (e.g. the arp starts when a pad is held); whether pulses
actually advance is the Transport's `running`. So an instrument ticks when the Transport is
running AND its own Clock is started.

## The looper (a synced consumer of position)

The HiClone looper records *audio*, not events, so grid-locking it needs the Transport's
position, not just its clock:

- loop **length** snaps to a whole number of bars (quantize to bar),
- playback **starts on the downbeat** (phase-aligned),
- and it **pauses / resumes** with the Transport's `running`.

This mirrors a modern looper pedal's "quantize to bar" mode.

## The Rig

A `Rig` is a set of instruments + exactly one Transport. Its invariant: every synced instrument
in the rig shares that one Transport. That shared Transport is what "in time" means. The rig
config (`src/rig/rigStore.ts`) persists which instruments are in the rig and where each lies on
the desk; the Transport is session state (tempo/running/position), not persisted per-rig beyond
the tempo.

## The experience

One **Transport bar** is the master: `PLAY/PAUSE`, `STOP`, `TEMPO`, and a `bar.beat` readout. A gear
person reads it instantly as "the thing everything follows."

- Press **PLAY once** and the whole rig runs locked: drum steps, any arpeggio, and any loops all
  advance on the same clock and line up on the downbeat.
- **Pause** freezes the whole timeline in place (drums AND loops hold; play resumes from there);
  **Stop** returns everything to bar 1. Standard transport, so no instruction needed. The recorded
  loops FOLLOW the transport (each looper subscribes): a Pause holds each loop at its phase (restarted
  phase-continuously on resume), a Stop resets them to bar 1. The looper has no Pause *gesture* of its
  own - a device's own Stop (the joystick down-flick) rides the shared transport, so 'stop' is one
  thing across the rig. Solo (a rig of one, free-run) the looper stops its own loops directly.
- Lean into an instrument (tap to zoom): its **own** controls are local (patterns, sounds, knobs).
  But **tempo and play are the shared master**, and they read the same on the instrument's own
  transport controls and on the Transport bar, because they are the same Transport. A device's
  own play (the TR-B0B START) toggles the shared Transport - there is exactly one "play".
- **Free** instruments play live over the top, no clock.

Mental model: *the transport bar is my DIN-sync master; each device is slaved to it or played
free; I press play once and the rig is in time.*

## Loops follow the tempo (pitch-preserving time-stretch)

A recorded loop is baked audio at its record tempo, so a naive player drifts against the (sequenced,
already-following) drums when the BPM changes. Instead the looper RE-TIMES each layer with a
pitch-preserving time-stretch (Signalsmith Stretch, MIT, WASM/AudioWorklet - lazy-loaded so it stays
out of the initial bundle). Each `Track` keeps its ORIGINAL record-tempo PCM + `recordBpm`; on a
(debounced) tempo change, `restretchTracks` renders each layer OFFLINE (an OfflineAudioContext with
the Signalsmith node - note: `addBuffers` must be AWAITED or the render fires before the worklet has
the audio) from the ORIGINAL (never a prior stretch, so no cumulative artifact) to the new tempo, then
swaps the buffers in while keeping the loop's PHASE continuous so it never jumps against the drums.
`infrastructure/audio/timeStretch.ts` is the isolated helper; the live playback path (AudioBufferSource)
is unchanged. Verified end-to-end: a 1-bar loop at 120bpm re-renders to the exact bar length at 80 and
160bpm, pitch preserved.

## Timing precision (future: an audio-clock scheduler)

Today the `IntervalTicker` drives the transport off the WALL clock (`performance.now`,
self-correcting so the tempo stays exact under render-load throttling), while the looper's
metronome + loops run off the AUDIO clock (`AudioContext.currentTime`, sample-accurate). Same rate,
but two different clocks + two different anchors, so the drum hits (fired "now" on the wall-clock
ticks) can phase-jitter against the sample-accurate loops. The correct fix is the classic "two
clocks" pattern (A Tale of Two Clocks): drive the transport off the audio clock and SCHEDULE each
upcoming event (drum hit, arp note) at its precise `ctx.currentTime` via a small look-ahead window,
instead of triggering "now". For cross-instrument sample-lock the instruments should also share ONE
AudioContext (they each create their own today). This makes the drums, arp, loops, and the position
readouts all read the same clock - eliminating drift + the per-hit looseness.

## Multiplayer (future)

`/rig/<uuid>` is designed to become the Ableton Link model: a shared beat timeline broadcast over
WebSocket, every client locked to the room's tempo + phase, no master. The room id in the URL is
the "same WiFi." Nothing in the domain model changes - only the `Ticker` / Transport gains a
network-synced source.
