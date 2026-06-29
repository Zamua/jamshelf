# chord-synth — working notes

A playable, 3D chord synthesizer in the browser, inspired by the HiChord (Pocket Audio) but unbranded. React + react-three-fiber + TypeScript + Vite, organized with DDD.

## What it is

7 chord pads play the 7 diatonic chords of a chosen key + scale ("no wrong notes"). A joystick morphs the held chord live; gray/yellow/red menu buttons set key/scale/octave, sound, and tempo. The device is a real 3D model you can rotate and inspect. Multi-touch, mobile-first.

## Architecture (DDD, dependency rule points inward)

```
src/
  domain/music/        PURE music theory. No I/O, no framework. Fully unit-tested.
    types.ts           value objects (PitchClass, Degree, ScaleName, Quality, KeyState, Chord)
    scales.ts          SCALES interval sets, SCALE_LABELS/ORDER, PAD_LAYOUT, NOTE_NAMES
    chords.ts          degreeToMidiNotes, qualityOffsets, nameChord, resolveChord, midiToFreq
  application/         use-cases + ports. Depends on domain only.
    ports.ts           SynthPort (audio output contract) + PatchName
    state.ts           ViewModel (the observable UI state) + MenuField
    synthController.ts SynthController: owns musical state, orchestrates domain + SynthPort, publishes ViewModel
  infrastructure/      adapters implementing ports. Depends on application contracts.
    audio/webAudioSynth.ts  WebAudioSynth implements SynthPort (the real synth engine)
    audio/nullSynth.ts      no-op SynthPort for tests/SSR
  ui/                  React + R3F. Depends on application (via hooks) + domain types.
    three/Device.tsx        the 3D device (assembled from component meshes)
    three/deviceProps.ts    DeviceProps + DeviceHandlers (the 3D<->logic contract)
    components/             2D overlays (manual, etc.)
    hooks/useSynth.ts       React adapter: owns SynthController, mirrors ViewModel, exposes DeviceHandlers
  App.tsx              composition root: wires useSynth -> Canvas -> Device
```

**The contracts that keep lanes decoupled** (do not break these casually):
- `SynthPort` — what the controller calls; what audio adapters implement. Voice groups keyed by an opaque `voiceId` (one chord = one group; re-`noteOn` with the same id replaces it, which powers the live morph).
- `DeviceHandlers` / `DeviceProps` — the 3D device is purely presentational: it renders the `ViewModel` and fires raw, semantic-free input (`onPadDown`, `onJoyMove`, ...). All musical interpretation lives in the controller, so the 3D and logic lanes stay independent.
- `ViewModel` — the single observable state the UI renders.

## Music model notes

- 7 seven-note scales: MAJOR, MINOR, HARMONIC, MELODIC, DORIAN, MIXO, LYDIAN. Chord qualities EMERGE from stacking scale thirds (never hardcoded); adding a mode is just its interval set.
- Pad layout (the real device interleaves): bottom row = degrees **1, 3, 5, 7**; top row = degrees **2, 4, 6** (each top pad sits "between" two bottom pads, piano-style). See `PAD_LAYOUT`.
- Joystick morph: TRIAD center + 8 directions (7th/9th/sus4/sus2/OPEN/add9/6th/JAZZ). Releasing the joystick springs the held chord back to a triad (matches the hardware).

## Commands

- `npm run dev` — Vite dev server (HMR)
- `npm run build` — `tsc -b && vite build` -> `dist/`
- `npm run test` — vitest (domain unit tests; UI tests opt into jsdom per-file)
- `npm run lint` — oxlint
- `npm run preview` — serve the built `dist/`

## Conventions / gotchas

- **`erasableSyntaxOnly` is ON** (Vite TS template default). NO TypeScript constructor parameter-properties, NO `enum`, NO `namespace`. Use explicit fields + union types + `as const` arrays. (Bit us once on the controller constructor.)
- **No em dashes** anywhere (code, comments, UI text, commits). Colons/parens/hyphens instead.
- DDD/TDD: domain stays pure and tested; cross-cutting concerns (audio, input) live in adapters; the core depends on ports, never on a vendor SDK.
- React 19 + R3F v9 + three 0.185. vitest 4 needs `@rolldown/binding-darwin-arm64` (installed; reinstall it if `npm ci` drops the optional native dep).
- Node 20.18 is a hair under Vite's preferred 20.19+ (warning only; builds + previews fine). Bump node if it ever bites.

## Deploy

- Build -> deploy `dist/` as a hostthis **static site**: `tar czf - dist/ | ssh hostthis.dev` (returns a `<slug>.hostthis.dev` URL; SPA fallback serves index.html for client routes). Re-deploy in place with `... ssh hostthis.dev <slug>`.
- Tailnet dev preview for the iPad: TBD (pm2 + caddy + tailscale serve, per the macmini app pattern).

## The 3D device (look-matching notes)

The device is modeled to match the real HiChord closely (the user's bar). Key
structural facts, learned by iterating against the official photos in
`scratchpad/ref/` (front-black.jpg is the cleanest unoccluded reference):

- ONE large recessed **well** (`KEY_WELL`) holds the WHOLE right cluster - the
  OLED + 3 menu buttons + 7 keys - all rising FLUSH from its floor (there are NO
  separate per-button cutouts). The well hugs the cluster with a small margin. The
  speaker, mic and joystick sit on the raised land to its LEFT.
- The well is **real cut geometry**, not a painted-on dark rectangle: `Chassis.tsx`
  builds the body face as an `ExtrudeGeometry` of a rounded-rect with a rounded-rect
  HOLE at the well, extruded forward by `WELL_DEPTH`. The hole's inner walls catch
  the scene lighting so it reads as a true sunken panel. A darker floor plane sits
  at the bottom; a full `RoundedBox` behind provides sides/back/top-edge.
  GOTCHA: a solid slab front face would OCCLUDE any recess behind it - you must cut
  the hole. Also: surface-mounted bits (speaker dots, mic) sit at `FRONT_Z + ~0.012`;
  if you re-enable an extrude bevel the land front creeps proud and hides them.
- **4-column grid**: the 4 top cells (OLED + 3 menu buttons) are SQUARES that
  share the column centers + width (`COLS`, `KEY_W`) of the 4 bottom keys, so they
  line up vertically. The 3 sharp (top) keys sit at the gaps BETWEEN columns; each
  sharp's square platform is offset to the inside, over its bottom-key gap (piano
  interleave). Tighten everything via `BLOCK.gap`.
- Keys + menu buttons all sit **FLUSH** with the case face (only the joystick
  protrudes): `PAD.restZ` is set so the keycap top is level with `FRONT_Z` and the
  lower body hides behind the well floor.
- Each menu button is a rounded-square tile (≈ a key footprint) with a **concave
  finger dish** scooped into its flush top. The tile FACE is an `ExtrudeGeometry`
  frame with a CIRCULAR HOLE so the dish below is not occluded (a solid flat top
  would hide it - same recess gotcha as the well; this bit us for several iterations
  where the buttons read as proud cushions). The dish is a real concave bowl: a
  `LatheGeometry` of a spherical-cap arc (`buildBowl` in `MenuButton.tsx`), rim at
  the face dipping below. The icon is **painted flat** on the dish (thin coplanar
  rings/bars, NOT 3D objects); ink is contrast-aware via `isLightBody` (dark glyph
  on the light gray/yellow buttons, white on red). Speaker is a FILLED octagon dot
  field (grid clipped to the octagon). Body edges are steep (`BODY_RADIUS` ~0.1);
  body material is mildly metallic + low roughness for an anodized sheen.
- Top-edge hardware (`TopEdge.tsx`: PWR slider, VOL wheel, 3.5mm jack, USB-C) is
  shifted back (`group z -0.12`) to sit centered on the top face depth.
- **Swappable shell color**: `BODY_THEMES` in `palette.ts` lists the editions
  (body / deep / floor shades). The controller holds an unbounded `themeIndex`
  (cycled by `swapColor()`, exposed on the ViewModel); the UI maps it modulo the
  theme count - NO hex colors leak into the application layer. Chassis/Speaker/Knob
  + the joystick dots take their colors from the resolved theme; cream keys, accent
  buttons and the screen are fixed. A round swatch button in `App.tsx` cycles it.
- All geometry lives in `layout.ts` (`KEY_WELL`, `SCREEN`, `MENU`, `SPEAKER`,
  `MIC`, `KNOB`, `COLS`, `KEY_W`, `BLOCK.gap`, `BRAND`, `JOY_DOTS`, `PAD`,
  `padSpecs()`). Tune there.

Render loop for look-matching: `npm run build`, `npx vite preview --port 4231`,
then Playwright (software WebGL: `--use-gl=angle --use-angle=swiftshader`) via the
screenshot-harness venv -> PIL side-by-side vs `scratchpad/ref/front-black.jpg`.
Live preview deploy: `https://4jzmz9uv.hostthis.dev` (re-deploy in place).

## Play modes + tempo clock (Phase 1, shipped)

The red button opens a MODE menu (mirrors the gray KEY menu) selecting the play
mode: PLAY / STRUM / ARP / DRONE / REPEAT / LEAD, plus the arp pattern, strum
speed, rate, and BPM. Design is in `docs/SPEC.md` (Phase 1). Key pieces:

- `domain/music/performance.ts`: PURE helpers (`PlayMode`/`ArpPattern`/`Rate`/
  `StrumSpeed`, `arpOrder`, `leadNote`, `rateBeats`, `strumMs`). No timing/randomness.
- `application/ports.ts` `Clock`: a BPM tick source (port, NOT domain). Impl is
  `infrastructure/clock/intervalClock.ts`. The controller subscribes to ticks and
  drives the arp/repeat through the pure helpers, so it is testable with a fake clock.
- `SynthController`: per-mode pad dispatch + a ONE generalized menu engine (KEY +
  MODE, context-dependent field set). The clock is gated on a pad being held, so it
  starts phase-aligned to the first press (no first-note flam) and never idle-ticks.
  DRONE latches (fixes the two-hand morph problem); LEAD is mono root; STRUM widens
  the synth strum spread; ARP/REPEAT are clock-driven.
- The menu renders on the OLED (no floating 2D panel). `useSynth` maps the joystick
  to the morph (8 directions, with a centre dead-zone + angular gaps + hysteresis so
  diagonals do not clip a neighbour) or to menu nav (latch hysteresis + axis-dominance
  gating so wobble and up/down-vs-left/right confusion are gone).

Touch/multitouch correctness lives in the UI lane: a shared `joyPointer` ref
(`Device.tsx`) is set by the Knob and IGNORED by the Pads, so a finger that owns the
joystick can never trigger a key (even dragged over one); iOS text-selection / callout
/ magnifier are suppressed via CSS so a hold cannot strand the joystick.

Tests: `domain/music/__tests__/performance.test.ts` + `application/__tests__/
synthController.test.ts` (fake clock + spy synth). Run `npm run test`.

## Roadmap (HiChord feature parity)

Shipped: Phase 1 play modes; the joystick DEFAULT layout now MATCHES the real
device (up=FLIP maj/min, up-right=DOM7, right=7th, down-right=9th, down=sus4,
down-left=6th, left=DIM, up-left=AUG - with real dim/aug/dom7/flip chord types in
`chords.ts`; the 7 pads + diatonic 7th/9th stay "no wrong notes", these morphs are
deliberately chromatic); Bass mode (OFF/ROOT) as a KEY-menu field (`withBass`).

Also shipped: Inversions (`invert`/`voiceChord` in `performance.ts`; yellow cycles
the voice when idle, or the held chord's root/1st/2nd inversion when a pad is down).

**Synth engine (`infrastructure/audio/webAudioSynth.ts`)**: subtractive AND 2-operator
FM voices (a `Patch.engine` discriminator). Instruments: SAW/SINE/EPIANO(FM)/HX7(FM)/
STRINGS/CLARINET/BELL(FM)/ORGAN/PLUCK. `SynthPort.noteOn` takes an optional per-note
patch (the looper plays each track on its own instrument). Also a `drum(name)` method
synthesizing percussion (no samples).

**Looper (`application/looper.ts`)**: a 6-track EVENT looper (records the notes you
play, each tagged with its instrument, and loops them). Driven by a `Ticker` port
(`infrastructure/clock/rafTicker.ts`, RAF). The `RecordingSynth` decorator
(`infrastructure/audio/recordingSynth.ts`) transparently captures live notes at the
audio boundary while recording; the looper's playback talks to the REAL synth directly
so it is never re-recorded. UI: joystick CLICK (tap, no drag) = record/stop/overdub,
long-press = clear; the Knob detects tap vs hold vs drag and emits `onJoyClick`/
`onJoyHold`. The OLED shows REC n / LOOP n. 5 looper unit tests (fake ticker + spy synth).

**Drums (`DRUM` play mode)**: the 7 pads map to a kit (`drumForDegree`); drum hits
flow through the RecordingSynth + Looper so beats loop. Kits via the DRUM-mode KIT
field: TIGHT/BOX808/BOX909 are SYNTHESIZED (`KIT_TUNE` factors); TRAP/LOFI are CC0
SAMPLE kits. Samples live in `public/drums/<kit>/<pad>.mp3` (one mono mp3 per pad),
lazy-loaded + decoded on first use (`SAMPLE_KITS` map in `webAudioSynth.ts`; fetch
`drums/<folder>/<pad>.mp3`, cache by `${kit}:${pad}`); the first hit before a kit
finishes loading falls back to the synth so it is never silent. All bundled samples
are CC0 1.0 (public domain, no attribution) - the TRAP/LOFI kits are sounds the user
hand-picked from Freesound (see `public/drums/CREDITS.txt`).

Adding a genre kit (the established workflow): use the *Freesound API* - the user's
key is at `~/keys/freesound` (the 40-char token only; never commit it). Token auth:
`curl -sG https://freesound.org/apiv2/search/text/ --data-urlencode 'query=...'
--data-urlencode 'filter=license:"Creative Commons 0" duration:[0.05 TO 2]'
--data-urlencode 'fields=id,name,username,license,previews,avg_rating' --data-urlencode
'sort=rating_desc' --data-urlencode "token=$(cat ~/keys/freesound)"`. The `previews`
field gives public `preview-hq-mp3` CDN URLs (downloadable without auth; CC0 = fine to
bundle). Prefer COHESIVE single-producer kits over mixing sources. Build a tappable
audition page (scratchpad), deploy it as its own hostthis static site, send the link,
let the user pick by number, then drop the chosen mp3s into `public/drums/<kit>/` and
add the kit to `DrumKit` + `DRUM_KITS` + `SAMPLE_KITS`. LICENSING IS THE WHOLE TRICK:
ONLY bundle CC0 / public-domain (or CC-BY *with* a credit line in CREDITS.txt) - the
deployed site is public-reachable, so "royalty-free for your tracks" packs are NOT
redistributable. Most "free drum kits" online fail this; CC0 ones skew to loops +
partial packs.

**Scales**: 10 total - the 7 modes plus MAJ_PENT / MIN_PENT / BLUES. `scaleTone` is
generalized to any scale length (the 7 pads wrap the 5/6-note scales into octaves).

**Effects**: tempo-synced feedback DELAY + a CHORUS as FX sends off the master
(`SynthPort.setFx`); an FX field in the KEY menu cycles OFF/DELAY/CHORUS/BOTH; the
delay re-syncs to BPM. Reverb is always-on per-patch.

The KEY menu is now KEY/SCL/OCT/BASS/FX; the MODE menu is context-dependent (ARP ->
PATTERN+RATE, STRUM -> SPEED, REPEAT -> RATE, DRUM -> KIT, all + BPM).

Touch hardening shipped:
- shared `joyPointer` ref (joystick finger can't hit keys);
- the joystick is a FLOATING stick - on touch-down the landing point becomes the
  centre (origin) and deflection is RELATIVE to it (`Knob.tsx`), so a touch never
  snaps to a direction; a big invisible grab disc makes it easy to grab. Morph has a
  large centre dead-zone + engage/release magnitude hysteresis + angular gaps; menu
  nav has latch hysteresis + axis-dominance gating;
- the joystick well is a real cut recess (Chassis cuts a `KNOB_WELL_R` circle ~ the
  cap width, inside the dot ring); only the cap protrudes; aux + USB-C are flush
  recessed holes (PWR slider + VOL wheel still protrude);
- iOS magnifier/loupe is a Safari wontfix that CSS canNOT stop; the canonical fix is
  `preventDefault` on the canvas's raw `touchstart`/`touchmove` (in `App.tsx`
  `onCreated`) - pads/joystick run on pointer events so they are unaffected. (CSS +
  selectstart/gesturestart + locked viewport are kept as extra layers.)

Next, in rough priority: joystick EXTENDED/CHROMATIC modes (richer voicings + key
modulation); a step sequencer; Web-MIDI out; presets; chord-lock; more effects
(tremolo/filter/flanger); games. The repo is private at github.com/Zamua/chord-synth.

## Current state

DDD skeleton + real Web Audio engine + the modeled/assembled 3D device + Phase 1
play modes are built, tested, and deployed (`https://4jzmz9uv.hostthis.dev`). Domain
+ controller are unit-tested. Active work: closing HiChord feature gaps (see roadmap)
and iterative polish. See `README.md` for the human-facing overview.
