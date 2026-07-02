# StyloClone — spec + build plan

The **StyloClone** is jamshelf's second instrument: a faithful, unbranded recreation of the
**1968 Dubreq Stylophone** (the "Standard"), the original pocket stylus synth. Where the
HiClone is a polyphonic chord groovebox, the StyloClone is its opposite in spirit: a dead-simple
**monophonic** stylus instrument with one dirty oscillator. Adding it is also the moment the
jamshelf framework grows from "hosts the HiClone directly" to "hosts the route-selected
instrument" (the generalization, below).

## The faithful original (1968 Dubreq Standard)

Pulled from the official Dubreq S1 manual (the modern faithful re-release) and a full
reverse-engineering teardown of the original circuit. Sources at the bottom.

| Aspect | The original |
| --- | --- |
| Keyboard | **20 metal keys** etched on a PCB, laid out **piano-style**: naturals along the bottom row, sharps/flats offset in a shorter top row |
| Range | **A2 -> E4**, chromatic, **exactly 20 notes** (A2 A#2 B2 C3 ... up to E4) |
| Play | a **stylus** (metal tip on a cord) touches ONE key to close the circuit for that note. **Strictly monophonic** - one note at a time; touching two keys plays the last-contacted only |
| Sound | a **relaxation oscillator** (uni-junction transistor) = a buzzy, reedy, sawtooth-ish tone with an exponential-charge edge, NOT a clean square. Each key is just a different resistor into that ONE oscillator |
| Vibrato | a **~7 Hz triangle LFO**, toggled by a front **on/off switch**; modest pitch depth |
| Tuning | a **pitch pot** (original: on the rear) that shifts the whole instrument up/down a little |
| Power | an **on/off switch** on the front panel |

**S1 reissue (2007) additions** we fold in because they are period-faithful and useful in a
browser: a **volume knob**, an **audio out**, and **two extra sounds**. We will ship the
original relaxation buzz plus a small number of faithful voices.

### Scope decisions (locked)

1. **Range: original 20 keys, A2 -> E4.** Faithful is the whole point. (Not extended to 3
   octaves like the modern Stylophone 5.)
2. **Monophonic.** True to the hardware and central to the character. Touching/sliding across
   keys retriggers the single voice (a natural legato slur as the stylus drags) rather than
   stacking notes.

## Note layout (the 20 keys)

MIDI 45 (A2) .. MIDI 64 (E4), inclusive = 20 semitones = 20 keys. Piano interleave:

```
top row (sharps):    A#2 C#3 D#3   F#3 G#3 A#3 C#4 D#4
bottom row (nats):  A2  B2 C3  D3 E3 F3 G3 A3 B3 C4 D4 E4
```

12 naturals on the bottom, 8 accidentals on top, each accidental sitting in the gap between
its two naturals (no accidental between B/C and E/F, exactly like a piano). Total 20.

## Sound design (Web Audio, `webAudioStylophone.ts`)

One monophonic voice. Faithful character over realism:

- **Oscillator:** a `sawtooth` shaped toward the relaxation-osc buzz. Start from a raw
  sawtooth (rich odd+even harmonics like the exponential-charge ramp), optionally a
  `PeriodicWave` tuned to emphasise the reedy formant. A gentle lowpass (~a few kHz) tames the
  fizz; a touch of drive/waveshape adds the nasal grit.
- **Envelope:** near-instant attack, no decay to speak of, a very short release when the stylus
  lifts (the original just makes/breaks contact - almost a gate). A tiny release avoids clicks.
- **Vibrato:** a shared ~7 Hz triangle LFO on the oscillator `detune` (small cents depth),
  gated by the vibrato switch. One LFO for the instrument (mono), not per-note.
- **Tune:** the pitch pot maps to a global `detune` offset (a few semitones range).
- **Volume:** master gain 0..1.
- **Voices:** the base BUZZ plus a couple of faithful alternates (e.g. a rounder tone). Kept
  minimal; no FM/looper - this is the simple instrument.

Port shape (mirrors the HiClone's ports/adapters split so the domain never touches Web Audio):

```
StylophonePort {
  resume()                       // unlock audio on first gesture
  noteOn(midi)                   // (re)start the mono voice at this pitch (retrigger/slur)
  noteOff()                      // release the voice (stylus lifted)
  setVibrato(on)                 // ~7Hz LFO on/off
  setTune(cents)                 // pitch pot
  setVolume(v)                   // 0..1
  setVoice(name)                 // BUZZ + alternates
  setMuted(muted)                // power gate
}
```

## DDD stack (`src/instruments/styloclone/`)

Mirrors the HiClone's layout; much smaller.

```
styloclone/
  manifest.ts                     shelf metadata (id 'styloclone', accent, blurb)
  domain/
    keyboard.ts                   PURE: the 20-key range (LOWEST_MIDI/HIGHEST_MIDI, KEYS[]),
                                  noteName(midi), keyRow (natural/accidental), midiToFreq.
                                  Unit-tested (exactly 20 keys, A2..E4, names correct).
  application/
    ports.ts                      StylophonePort + SettingsStore (voice/vibrato/tune/volume)
    state.ts                      ViewModel (power, litKey|null, vibrato, tune, volume, voice, inspect)
    stylophoneController.ts       framework-agnostic: press/release a key, toggle vibrato,
                                  set tune/volume/voice, power, inspect. Persists settings.
  infrastructure/
    audio/webAudioStylophone.ts   the relaxation-osc mono synth (StylophonePort)
    audio/nullStylophone.ts       no-op adapter for tests
    persistence/localStorageStylophoneSettings.ts   (namespace 'styloclone')
  ui/
    deviceProps.ts                DeviceHandlers (semantic-free input) + DeviceProps
    hooks/useStylophone.ts        React adapter: owns the controller, mirrors the ViewModel,
                                  exposes handlers, adds desktop keyboard play (Z S X ... a
                                  piano-row mapping across the 20 keys)
    three/                        the 3D device: the cream box, the silver PCB keyboard plate,
                                  the stylus on a cord, vibrato + power switches, tune + volume
                                  knobs, the wordmark. Layout constants in layout.ts.
    components/Manual.tsx         how-to-play
```

Persistence is **namespaced** (`jamshelf/styloclone/settings` in localStorage), same convention
as the HiClone, so each instrument keeps its own memory. No looper (the simple instrument), so
no IndexedDB.

## Framework generalization (jamshelf hosts the route-selected instrument)

Today `Stage` and `Experience` import the HiClone's `Device` / `useSynth` / `ViewModel`
directly (single-instrument shortcut). A second instrument forces the generalization the
original CLAUDE.md always anticipated. Design:

- **`shared/instrument.ts` gains an `InstrumentModule`** bundling everything the host needs to
  mount ONE instrument, self-typed over its own VM/Handlers:
  ```
  InstrumentModule {
    manifest: InstrumentManifest
    useInstrument(): { vm, handlers }         // the instrument's React hook
    Device: Component<{ vm, handlers }>        // its 3D device
    Manual?: Component<{ open, onClose }>       // optional how-to-play
    rest: { bboxHeight, ... }                  // measured local bbox so the Stage rests it
                                               // exactly on the shelf/desk (per-instrument)
    onPointerMissed?(handlers): void           // e.g. release the note when the tap misses
    chrome?: { swatch?, ... }                  // optional play-chrome extras (color swap)
  }
  ```
- **`registry.ts`** maps `id -> InstrumentModule` (not just manifests). `instrumentById` returns
  the module.
- **`Stage` becomes instrument-agnostic**: it takes an already-wired **device node** (plus the
  per-instrument rest offsets so the shelf/desk pose math uses that device's measured height,
  not the HiClone's hardcoded `SHELF_POS.y`), and an `onPointerMissed` callback. It renders the
  device node inside the animated `<group>`; it no longer imports any instrument.
- **`Experience` picks the module by route** and mounts an `<InstrumentHost module={...}>` that
  calls `module.useInstrument()` internally (so only the mounted instrument's hook/synth runs,
  no eager AudioContext for the others) and wires the Stage + play chrome + Manual.
- **The shelf** shows the instruments and floats the tapped one onto the desk. Incremental path:
  keep the current single-hero float working first (StyloClone reachable at `/styloclone`), then
  grow the shelf to display BOTH devices side by side with a tap-to-open on each. The pose math
  already supports a device at a shelf slot floating to the desk; the lift is mounting >1 device
  and giving each a shelf slot.

Guiding constraint: **do not regress the HiClone.** The generalization is a pure refactor of the
host; the HiClone module's behavior, look, and persistence are unchanged. Ship the StyloClone
reachable and playable first, then polish the multi-instrument shelf.

## Build phases

1. **Doc** (this file) + branch `feat/styloclone`. [done]
2. **Domain**: `keyboard.ts` (the 20-key A2..E4 model) + unit tests. Pure, no I/O.
3. **Application**: ports, ViewModel, `stylophoneController` (+ controller tests with a fake
   synth/settings store).
4. **Infrastructure**: `webAudioStylophone` (the relaxation-osc mono synth) + null adapter +
   localStorage settings.
5. **UI logic**: `useStylophone` hook (controller wiring + desktop keyboard play) + `deviceProps`.
6. **3D device**: the cream box + silver keyboard plate + stylus + switches/knobs + wordmark,
   look-matched against reference photos (screenshot loop like the HiClone).
7. **Framework**: generalize `Stage` + `Experience` + `registry` to the `InstrumentModule` shape;
   register the StyloClone; make it reachable at `/styloclone` without regressing the HiClone.
8. **Multi-instrument shelf**: show both devices on the shelf, tap-to-open each.
9. **Tests + verify**: domain + controller unit tests green; build clean; drive it in the browser
   (play a note, vibrato toggle, tune, power) before calling it done.

## Conventions (inherited)

- `erasableSyntaxOnly` ON: no TS parameter-properties, no `enum`, no `namespace`. Union types +
  `as const` arrays + explicit fields.
- No em dashes anywhere (code, comments, UI text, commits). Colons / parens / hyphens.
- DDD/TDD: domain pure + tested; audio/input in adapters behind ports; core never imports a
  vendor SDK.
- R3F `onClick` is dead on touch here (the canvas preventDefaults `touchstart`); mesh taps fire
  on `onPointerUp`.

## Sources

- Dubreq Stylophone S1 manual (ManualsLib): https://www.manualslib.com/manual/2096544/Dubreq-Stylophone-S1.html
- Reverse-engineering teardown (waitingforfriday): https://www.waitingforfriday.com/?p=334
- Stylophone (Wikipedia): https://en.wikipedia.org/wiki/Stylophone
