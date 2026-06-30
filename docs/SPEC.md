# HiClone design spec

Living design doc. The device is a playable browser homage to the HiChord (independent, unbranded),
built DDD: pure music domain, application services + ports, infrastructure adapters,
R3F presentation. This spec records the contracts and the in-flight feature work.

The dependency rule points inward: `domain` imports nothing outward; `application`
depends on `domain` + its own ports; `infrastructure` implements ports; `ui` depends
on `application` (via the `useSynth` hook) and `domain` types. Presentation details
(colors, geometry) never leak inward.

---

## Phase 1 — Play modes + tempo-synced clock + on-screen menus

Today the device only plays static chords; the red button is tap-tempo and BPM does
nothing real. Phase 1 adds the HiChord's core **play modes** and makes tempo matter,
while keeping the domain pure and timing behind a port.

### 1. Domain — `src/domain/music/performance.ts` (pure, fully unit-tested)

New value types (union types + `as const`, never `enum` — `erasableSyntaxOnly` is ON):

```ts
export type PlayMode = 'PLAY' | 'STRUM' | 'ARP' | 'DRONE' | 'REPEAT' | 'LEAD';
export type ArpPattern = 'UP' | 'DOWN' | 'UPDOWN' | 'DOWNUP' | 'RANDOM' | 'FINGER';
export type Rate = '1/4' | '1/8' | '1/16' | '1/8T';
export type StrumSpeed = 'SLOW' | 'MED' | 'FAST';

export const PLAY_MODES: readonly PlayMode[];   // menu order, as above
export const ARP_PATTERNS: readonly ArpPattern[];
export const RATES: readonly Rate[];
export const STRUM_SPEEDS: readonly StrumSpeed[];
```

Pure helpers (no I/O, no randomness inside the deterministic ones):

```ts
// Beats per tick for a rate (1/4 -> 1, 1/8 -> 0.5, 1/16 -> 0.25, 1/8T -> 1/3).
export function rateBeats(rate: Rate): number;

// Per-note strum spread in ms (SLOW 120, MED 80, FAST 40).
export function strumMs(speed: StrumSpeed): number;

// The ordered note cycle to step through for a deterministic arp pattern.
//   UP: ascending. DOWN: descending. UPDOWN: up then down without repeating the
//   endpoints (e.g. [0,4,7] -> [0,4,7,4]). DOWNUP: mirror. FINGER: fingerpick
//   (root, then alternate high/low pairs - document the exact order you choose
//   and pin it with a test). RANDOM returns the notes unchanged (the caller picks
//   a random index; randomness stays out of the pure domain).
export function arpOrder(notes: readonly number[], pattern: ArpPattern): number[];

// The single note a LEAD line plays for a chord (the root = the lowest note).
export function leadNote(notes: readonly number[]): number;
```

Tests pin every pattern's order for a sample triad + a 4-note chord, the rate->beats
map, strum ms, and `leadNote`.

`performance.ts` is re-exported from `src/domain/music/index.ts`.

### 2. Application port — `src/application/ports.ts` adds `Clock`

```ts
// A BPM-synced tick source. Timing lives here (a port), NEVER in the domain, so the
// controller's arp/repeat logic is testable with a fake clock.
export interface Clock {
  setBpm(bpm: number): void;
  setBeatsPerTick(beats: number): void; // e.g. rateBeats(rate)
  start(): void;
  stop(): void;
  onTick(cb: () => void): () => void;   // subscribe; returns unsubscribe
}
```

`SynthPort` is UNCHANGED (arp reuses `noteOn` with one freq; strum reuses
`setStrumMs`). Do not widen the synth port.

### 3. Infrastructure — `src/infrastructure/clock/intervalClock.ts`

`IntervalClock implements Clock` using `setInterval`. `setBpm` / `setBeatsPerTick`
recompute the interval (ms = 60000 / bpm * beatsPerTick) and reschedule if running.
`start` is idempotent; `stop` clears the timer; `onTick` supports multiple
subscribers. Guard against `bpm <= 0`. SSR-safe (no work until `start`).

A `FakeClock` (in the application test helpers, NOT shipped) lets controller tests
fire ticks by hand and assert scheduling.

### 4. Application — `src/application/synthController.ts`

Constructor becomes `constructor(synth: SynthPort, clock: Clock)`. It subscribes to
`clock.onTick` once and dispatches by mode.

New state: `mode: PlayMode`, `arpPattern: ArpPattern`, `arpRate: Rate`,
`repeatRate: Rate`, `strumSpeed: StrumSpeed`, plus a `latched` degree for DRONE and
an arp step counter.

**Generalize the menu (DRY).** Today only the gray KEY menu exists. Add a MODE menu
(red) reusing ONE menu engine:

- `menuOpen: boolean`, `menuKind: 'KEY' | 'MODE'`, `menuField: string`.
- KEY fields: `['KEY','SCL','OCT']` (as today).
- MODE fields: `['MODE','PARAM','BPM']` where PARAM is the mode's parameter
  (ARP -> pattern, STRUM -> speed, REPEAT -> rate; PLAY/DRONE/LEAD -> none, show `-`).
- `toggleMenu(kind)`: open that kind; if already open with the same kind, close;
  if open with the other kind, switch. Gray -> `toggleMenu('KEY')`, red ->
  `toggleMenu('MODE')`. (`toggleMenu()` with no arg keeps working as KEY for any
  existing callers, or update them.)
- `cursorField(±1)` / `editValue(±1)` switch on `menuKind`. Editing MODE/MODE field
  cycles `PLAY_MODES`; PARAM cycles the active mode's option list; BPM steps by 1
  (clamp 40..300). Editing a mode or its rate reconfigures the clock.

**Pad dispatch by mode** (replace the single `trigger` path; keep it DRY with a
private `dispatchPress/Release`):

- **PLAY**: noteOn full chord on down, noteOff on up (today's behavior). `setStrumMs`
  ~4ms (near-zero).
- **STRUM**: like PLAY but `synth.setStrumMs(strumMs(strumSpeed))` so notes roll out.
- **LEAD**: monophonic. Fixed voiceId `'lead'`; play `leadNote(chord.notes)` only;
  a new press replaces (re-`noteOn` same id); release stops it.
- **DRONE**: latch. On down, `noteOn('drone', chord)` and remember the degree; do NOT
  release on pad-up. Pressing the SAME latched degree again stops it (`noteOff`);
  pressing a different degree switches.
- **ARP**: the held pads feed the arp. On each tick, gather the union of all held
  chords' notes, `arpOrder(union, pattern)`, play `order[step % len]` as voiceId
  `'arp'` (single note), `step++`. Held empty -> release the arp voice and don't step.
- **REPEAT**: on each tick, re-`noteOn` every held chord (the attack pulses it).
  Held empty -> silence.

**Clock lifecycle**: `mode in {ARP, REPEAT}` -> `clock.setBpm(bpm)`,
`setBeatsPerTick(rateBeats(activeRate))`, `start()`. Any other mode -> `clock.stop()`
and release the `'arp'` voice. Switching mode clears mode-specific voices. Power-off
and inspect stop the clock + clear latched/arp/lead voices.

`revoiceHeld` (joystick morph) must keep working in PLAY/STRUM/DRONE/LEAD.

### 5. ViewModel — `src/application/state.ts`

Add `readonly mode: PlayMode;` and `readonly menuKind: 'KEY' | 'MODE';`. Keep
`menuField` as the active field label. The controller computes menu-aware
`screenBig` / `screenSmall` so the OLED shows the LIVE menu while open:

- KEY menu: big = active field + value with a `>` cursor (e.g. `> KEY  C`),
  small = the other two fields compactly (`SCL MAJ  OCT 0`).
- MODE menu: big = `> MODE  ARP` (or active field), small = `UP  120BPM` style.
- Menu closed: today's behavior (key+scale / patch+bpm, or a flashed chord/quality).

No new geometry: `Screen.tsx` already renders the two lines.

### 6. UI — `src/ui/hooks/useSynth.ts`, `deviceProps`, `App.tsx`

- `useSynth`: `new SynthController(new WebAudioSynth(), new IntervalClock())`.
- Red button handler `onTempo` now `controller.toggleMenu('MODE')`; gray `onKey`
  `controller.toggleMenu('KEY')`. Joystick while EITHER menu is open navigates it
  (the existing `navMenu` latch logic is menu-kind agnostic - reuse it).
- `KeyMenuHint` generalizes (or a sibling) to show whichever menu is open; minimal.
- Desktop: optionally number-key parity stays; add nothing required.

### 7. Tests

- `domain/music/__tests__/performance.test.ts`: all pure helpers.
- `application/__tests__/synthController.test.ts` (NEW, with `FakeClock` + a spy
  `SynthPort`): mode switching starts/stops the clock; ARP steps through `arpOrder`
  on ticks; DRONE latches across pad-up; LEAD is mono + root-only; REPEAT pulses on
  ticks; menu generalization (KEY + MODE nav/edit); power-off/inspect stop the clock.
- All existing 510 domain tests stay green. Update any `new SynthController(synth)`
  call sites to pass a clock (use `FakeClock`).

### Non-goals for Phase 1 (later phases)

Inversions, bass mode, joystick EXTENDED/CHROMATIC, looper, sequencer, more
scales/sounds, effects, drums, presets, Web-MIDI. Phase 1 is play modes + clock +
menus only.

---

## Stable contracts (do not break casually)

- `SynthPort` — audio output; voice groups keyed by opaque `voiceId`.
- `Clock` — BPM tick source (Phase 1).
- `DeviceHandlers` / `DeviceProps` — the 3D device is purely presentational; it fires
  raw, semantic-free input. All musical interpretation lives in the controller.
- `ViewModel` — the single observable state every view renders.
