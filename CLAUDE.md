# jamshelf — working notes

**jamshelf** is a 3D "shelf" of playable browser instruments: the shelf at `/` displays
the instruments as 3D models; tapping one opens it at `/<id>` to play. The first (and
currently only) instrument is the **HiClone**, a chord groovebox inspired by the HiChord
(Pocket Audio), unbranded. React + react-three-fiber + TypeScript + Vite + react-router,
organized with DDD. Future: multi-instrument "rig" configurations at `/rig/<uuid>` (the
same UUID becomes a multiplayer jam room). Was the `chord-synth` repo; renamed + restructured
into the shelf-of-instruments shape on 2026-06-30.

## Top-level structure (the jamshelf framework)

```
src/
  app/App.tsx          BrowserRouter > Experience (thin shell). Real URLs (/ , /<id>,
                       future /rig/<uuid>) for deep-linking, but the ROUTE only sets a mode.
  app/Experience.tsx   the composition root: useSynth() (the live HiClone), reads the route
                       -> mode 'shelf'|'play', renders the persistent <Stage> + the HTML
                       chrome (shelf caption / play tools+back) CROSS-FADED, gates device
                       interactivity until it lands, owns the Manual.
  stage/Stage.tsx      THE ONE PERSISTENT CANVAS. The shelf + the play view are the SAME
                       scene at two ends of a continuous move: the device floats off a wall
                       shelf, arcs forward + down onto a desk, while the camera swings to a
                       3/4 top-down desk view. One smootherstep-eased progress lerps the
                       device pose + the camera between SHELF and PLAY. NOTHING remounts ->
                       no cut. Warm cozy room throughout (no warm->cold shift).
  shared/
    instrument.ts      InstrumentManifest = shelf metadata only (id, name, blurb, hasMemory, accent)
    StudioLights.tsx   the metallic-sheen lighting rig (the Stage adds warm lamps on top)
  instruments/
    registry.ts        INSTRUMENTS[] + instrumentById() - the Experience reads this
    hichord/           the HiClone instrument (its own DDD stack, below)
      manifest.ts      the HiClone's shelf metadata
      domain/music/    PURE music theory (types, scales, chords, performance). Unit-tested.
      application/     ports.ts (SynthPort/Clock), state.ts (ViewModel), persistence.ts
                       (SettingsStore/LooperStore ports + coerceSettings), synthController.ts
      infrastructure/  audio/{webAudioSynth,nullSynth,webAudioLooper}, clock/intervalClock,
                       persistence/{localStorageSettings,indexedDbLooper} (NAMESPACED per instrument)
      ui/              three/Device.tsx + parts, deviceProps.ts, components/Manual, hooks/useSynth.ts
```

**Multi-instrument as of 2026-07-01 (the StyloClone landed).** The framework was generalized off
the old single-instrument shortcut: each instrument ships an **`InstrumentModule`**
(`shared/instrument.ts`: manifest + `useInstrument(enabled)` hook + `Device` + optional `Manual`
+ `releaseOnMiss` + optional `PlayTools`), the **`registry`** is a list of MODULES (not
manifests), and `Experience` mounts EVERY module's device on the shelf at once. Mechanics:
- `Experience` builds a **context provider stack** (`InstrumentProvider` nested via
  `reduceRight` over the static registry) so each instrument's hook is called exactly once,
  unconditionally, in a stable order (rules-of-hooks clean) while staying registry-driven. Each
  provider merges its `{vm, handlers}` into `InstrumentsCtx`; a single `StageHost` consumer below
  reads them all, builds the device nodes, and wires the ACTIVE instrument's play chrome.
- Only the **active** instrument (the route's `/<id>`) is `enabled` (responds to the desktop
  keyboard); the others are mounted but idle. The active device gets real handlers only once it
  has landed + is not being inspected (else no-op'd handlers, generic `noopLike`).
- `Stage` is now instrument-agnostic: it takes `instruments: {id, node, label}[]` + `activeId`,
  gives each a **shelf slot** (an x offset), and floats ONLY the active one to the desk (its own
  `DeviceRig` progress -> 1) while the others hold their slot. The camera is a shared `CameraRig`
  driven by whether an instrument is active. Nothing remounts, so the float stays continuous for
  every instrument. `SHELF_SCALE_MULTI` + `SLOT_SPACING` shrink/space the devices when >1.

**Persistence is namespaced per instrument** (`jamshelf/<id>/settings` in localStorage; the
HiClone also keeps one IndexedDB record in db `jamshelf`, store `looper`), so each instrument
keeps its own memory. Deploy is still ONE static SPA (the host's SPA fallback serves `/<id>` deep
links; a cold deep-link snaps straight to the play pose, no float).

**Rigs (`/rig/<uuid>`, added 2026-07-02).** A rig hosts several instruments in ONE session sharing
a tempo. The shelf has a "＋ new rig" button -> a build overlay (multi-select instruments) ->
`createRig()` stores the config (`src/rig/rigStore.ts`, localStorage keyed by uuid, `{instruments,
desk}`) -> navigates to `/rig/<uuid>`. `Experience.parsePath` routes shelf / single (`/<id>`) / rig.
In rig mode the "desk" instrument is React state (not the URL), switched by a **dock** (bottom tabs);
`activeId` = the desk instrument, so the Stage floats it in exactly like single-play. Because EVERY
instrument stays mounted + audio-live (the mount-all architecture), the drum beat keeps rolling while
you switch the desk to the HiClone (chords) or StyloClone (lead). A **transport bar** (top) holds one
shared BPM + a global play/stop. Sync wiring: each tempo instrument's hook returns an optional
**`InstrumentTransport`** (`shared/instrument.ts`: setBpm/getBpm/play/stop/isPlaying); the rig bar
pushes one BPM to all + toggles the sequenced ones. HiClone gained a public `setBpm`; the TR-B0B's
transport drives its 16-step sequencer; the StyloClone has no transport (free real-time lead). v1 is
shared-BPM + the beat as the audible clock; **NOT yet done: a single shared CLOCK so the HiClone arp is
sample-phase-locked to the drum grid** (each instrument still runs its own IntervalClock, so two
auto-sequencers would drift - fine for beat + live chords + live lead, the intended jam).

**The TR-B0B instrument** (`src/instruments/trb0b/`) is an unbranded TR-808-style 16-step drum machine:
8 synth voices (BD/SD/TOM/CLAP/CH/OH/CB/CY, all sample-free in `webAudioDrums.ts`), a pure sequencer
domain (`sequencer.ts`: pattern grid + step advance), a controller driven by a `Clock` (16th-note ticks
advance the playhead + trigger active voices), per-voice LEVEL knobs (the 808's per-instrument level),
and the 3D device (charcoal body, the 16 step buttons in color groups of 4, voice-select row, TEMPO
knob, START/STOP). The `Clock` port is shaped to be swapped for the rig's shared transport later. Note
knob indicators sweep min=lower-left to max=lower-right (a fixed inversion). Per-step VELOCITY was
deferred (UX undecided; the drum engine's `trigger(voice, accent)` already reserves an accent gain).

**The StyloClone instrument** (`src/instruments/styloclone/`) is a faithful, unbranded 1968 Dubreq
Stylophone: a strictly MONOPHONIC 20-key stylus synth (A2 -> E4, piano interleave) with a
relaxation-oscillator buzz, a ~7Hz vibrato, tune + volume pots, a sound selector (BUZZ/ROUND/REED)
and a tethered stylus. Its own small DDD stack (domain `keyboard.ts`, `stylophoneController`,
`webAudioStylophone`, `useStylophone`, the 3D `Device` + parts). Full spec + build notes in
`docs/STYLOCLONE.md`.

## The stage = ONE continuous scene, shelf <-> desk (`src/stage/Stage.tsx`)

A **cozy, lamp-lit room** (warm CSS bg behind the alpha canvas + `WarmLights`: a warm
`hemisphereLight` + amber `pointLight`s, incl. a desk lamp, layered over `StudioLights` so
the metal keeps its sheen). The room holds a **wooden wall-shelf up high** and a **wooden
desk below**. The HiClone is the SAME live `<Device>` throughout; only its pose + the camera
animate:
- **shelf end (progress 0):** propped back on the wall-shelf (`SHELF_TILT`), camera at eye level head-on.
- **play end (progress 1):** lying PERFECTLY FLAT on the desk (`PLAY_TILT = -90deg`), camera EXACTLY straight DOWN so the face is fronto-parallel / 2D - the old head-on play view, now on the desk. A straight-down camera needs the up-vector to NOT be parallel to the view: the up swings `SHELF_UP +Y` -> `PLAY_UP -Z` across the float (lerped in `applyPose`), so at the desk up is `-Z` (perpendicular to the -Y view) and the device's top edge stays at the top of screen. (A naive straight-down WITHOUT swinging up renders edge-on - which is also what an UN-posed device looks like; both bit us, see the pose-before-paint note above.)
- **inspect (a SECOND progress, `INSPECT_*`):** the eye button (`tool-btn` in the play chrome) raises a `inspect` flag; `Stage` blends a SECOND eased progress (`inspectTarget`, `INSPECT_DURATION` 0.75s) on top of the float one. `applyPose` takes both (`fe`, `ie`) and blends shelf->play->inspect; at full inspect the device floats UP off the desk to a centered presentation pose (`INSPECT_POS/TILT/SCALE`), the camera pulls back with up swung back to `+Y` (3/4 perspective, not straight-down), and the float arc is faded out (`*(1-ie)`). The user **drags to SPIN**: `Experience` accumulates a `spin {x,y,vx,vy,dragging}` ref from pointer events on a full-screen `.inspect-drag` surface (horizontal -> `spin.y` turn, vertical -> `spin.x` tilt, clamped), and `applyPose` applies it as `device.rotation.set(baseTilt + spin.x*ie, spin.y*ie, 0)` - so the spin only bites while inspecting and the device rotates IN PLACE (no OrbitControls / camera-control handoff). Play handlers are no-op'd while inspecting (you're examining it, not playing it); spin resets on each open; leaving play closes inspect.
- **Momentum (the floaty flick):** a clean INPUT/RENDER split. The input layer (`Experience` drag handlers) sets BOTH position and angular velocity (`vx`/`vy`), deriving velocity from the **real pointer-event timing** (`(deltaRad)/(e.timeStamp delta)`, exp-smoothed) - NOT frame-sampled, so it survives the release. The render layer (`stepSpin` in the `Rig` frame loop) coasts: while `dragging` it bleeds velocity (`SPIN_HOLD_DECAY`) so a stop-then-lift doesn't fling; once released it integrates `vx/vy` and decays them (`SPIN_FRICTION` ~0.95/60fps-frame -> ~1s coast), capped at `SPIN_MAX_V`. (First cut frame-sampled the velocity and it died on release - the idle frame between the last drag-move and pointer-up decayed it to ~0; pointer-timestamp velocity is the fix.)
- **Rest exactly, don't eyeball:** the device's local bbox was MEASURED (`Box3.setFromObject`, ~2.41 x 1.76 x 0.45, pivot ~centered). `SHELF_POS.y` = plank-top + the device's lowest-point-below-pivot at the shelf tilt (~0.73); `PLAY_POS.y` = desk-top + the lowest point when flat (~0.22). Repeated "still clipping" reports were me under-estimating the height by eye - measure it.

**Tapping the shelved device floats it to the desk in ONE continuous move - no route swap,
no fade, no cut.** A `Rig` advances one progress toward the target (shelf=0/play=1) and
**smootherstep**-eases everything: it `lerpVectors` the camera position + target, and the
device group's position / x-rotation / scale, every frame. The float **pops UP then bows
FORWARD**: a FRONT-LOADED lift (`position.y += sin(sqrt(fe)*PI)*FLOAT_LIFT`, peaks early ~fe
0.25) raises the device off the shelf so its lower edge clears the plank top BEFORE it pulls
out, then a later symmetric forward bow (`position.z += sin(fe*PI)*FLOAT_BOW`) carries it out
+ down onto the desk. Without the lift the device's bottom clipped through the shelf plank
(it dropped straight down while still over it); the sqrt front-loads the lift so net `y` rises
ABOVE the shelf rest at low `fe`, and the smootherstep on `fe` keeps the onset velocity zero
(no snap). Both arcs fade out for inspect (`*(1-ie)`). Because the canvas is mounted ONCE
at the app root (`Experience`) and only `mode` changes, nothing ever remounts. The pose is
applied by `applyPose()` from BOTH the `useFrame` loop AND a `useLayoutEffect` that runs once
before the first paint - else the first painted frame shows the device at its un-posed default
origin (a clip flash through the room) before the loop kicks in.

`Experience` cross-fades the HTML chrome (shelf caption <-> play tools+back) as the device
floats, and gates device interactivity: the device only becomes playable `FLOAT_MS` (~1.25s)
after entering play (so taps mid-float don't fire notes); on the shelf a tap hits an
invisible catcher that calls `onShelfTap` (navigate to play). A cold deep-link to `/<id>`
snaps to the play pose (the `Rig`'s progress ref initializes to the target, no animation).

History: this REPLACED a first cut where the shelf + the play view were two separate canvases
bridged by a camera-dive + dark fade + route swap - which still read as a jump cut (warm shelf
-> cold play stage). Unifying into one persistent canvas is what makes it truly seamless.

--- everything below is the HiClone instrument (under `src/instruments/hichord/`) ---

## The HiClone instrument (DDD, dependency rule points inward)

7 chord pads play the 7 diatonic chords of a chosen key + scale ("no wrong notes"). A
joystick morphs the held chord live; gray/yellow/red menu buttons set key/scale/octave,
sound, and tempo. The device is a real 3D model you can rotate and inspect. Multi-touch,
mobile-first. (Paths below are relative to `src/instruments/hichord/`.)

**The contracts that keep lanes decoupled** (do not break these casually):
- `SynthPort` — what the controller calls; what audio adapters implement. Voice groups keyed by an opaque `voiceId` (one chord = one group). `noteOn` with the same id REPLACES the group (a fresh attack); `retune` slides a SOUNDING group to new pitches WITHOUT re-attacking (the LEGATO joystick morph - overlapping notes glide ~25ms, added notes swell in, dropped notes release out). The live morph + inversions + key/scale edits of a held chord all go through `retune` so they never re-pluck; `retune` falls back to `noteOn` if the id is not currently held.
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
- **R3F `onClick` is DEAD on touch in this app.** `Stage`'s `onCreated` preventDefaults the raw `touchstart` (the iOS magnifier/loupe fix), which suppresses the synthetic `click` on touch devices. So any tappable mesh must fire on `onPointerUp`, NOT `onClick` (pointer events still fire). The shelf tap-to-open catcher hit this: onClick worked on desktop (mouse) so it passed in dev, but did nothing on a phone. Use `onPointerUp` for mesh taps.
- **iOS home-indicator black bar (the bottom safe-area strip).** That strip is painted from the `html` box; with `height: 100%` the html box stops at the SMALL viewport, leaving the strip outside it, so it falls back to the UA's black canvas (we set `color-scheme: dark`). Fix: `html { min-height: 100lvh; overflow: hidden }` + a warm root `background` so the warm bg reaches down and covers the strip. Note `viewport-fit=cover` + an html background ALONE do not reach it. **Chromium/Playwright does NOT render the iOS home-indicator zone**, so emulation cannot catch or verify this - check a real iOS screenshot.

## Deploy

- Build with `npm run build`, then serve `dist/` from any static host. The host MUST do SPA fallback (serve `index.html` for unknown client routes) so `/<instrument-id>` deep links resolve.

## The 3D device (look-matching notes)

The device is modeled to match the real HiChord closely. Key
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
- **Metallic look**: the case is `metalness ~0.78 / roughness ~0.28` and reflects a
  drei `<Environment>` built from `<Lightformer>` panels in `shared/StudioLights.tsx` (a bright overhead
  bar + a soft frontal fill + side panels) - NO CDN HDR (preset envs fetch from a CDN;
  this is local). Without an env map a high-metalness surface reads as dead dark grey;
  the lightformers are the brushed-aluminium sheen. Tune the FRONTAL panel intensity to
  trade head-on brightness vs sheen gradient (too bright = flat white).
- **Top-edge ports** (`TopEdge.tsx`, jack + USB-C) must sit slightly PROUD of the slab's
  top face (`TOP_Y`), never flush/coplanar with it - coplanar faces z-fight (shimmer in
  the 3D inspect view). The `HiClone` wordmark (`Brand.tsx`) is Poppins (`brandFont.ts`)
  SHEARED to lean right (oblique): an inner group's matrix is `makeShear(0,0,SLANT,0,0,0)`
  with `matrixAutoUpdate` off (the outer group carries the position), so it slants without
  bundling a separate italic font. The old rounded Baloo was replaced because it read as
  accidentally slanted; this is a deliberate, controlled rightward lean.
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
  buttons and the screen are fixed. The play-chrome color swatch (in `Experience.tsx`) cycles it.
- All geometry lives in `layout.ts` (`KEY_WELL`, `SCREEN`, `MENU`, `SPEAKER`,
  `MIC`, `KNOB`, `COLS`, `KEY_W`, `BLOCK.gap`, `BRAND`, `JOY_DOTS`, `PAD`,
  `padSpecs()`). Tune there.

Render loop for look-matching: `npm run build`, `npx vite preview --port 4231`,
then Playwright (software WebGL: `--use-gl=angle --use-angle=swiftshader`) via the
screenshot-harness venv -> PIL side-by-side vs `scratchpad/ref/front-black.jpg`.

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
- **LEAD mode specials**: the OLED names the single NOTE (e.g. `C4`, via `leadNoteName`),
  not the chord; and the joystick is a PITCH BEND (X = +/-2 semitones) + OCTAVE glide
  (Y = +/-1 octave) instead of the chord-quality morph. Implemented as a global
  `ConstantSourceNode` (the synth's `bendNode`) fanned into every oscillator's `detune`
  (so carrier + modulator bend together, FM ratio preserved); `SynthPort.setBend(cents)`
  drives it, `controller.setLeadBend` gates it to LEAD, and `allNotesOff` resets it to 0.
- The menu renders on the OLED (no floating 2D panel). `useSynth` maps the joystick
  to the morph (8 directions, with a centre dead-zone + angular gaps + hysteresis so
  diagonals do not clip a neighbour) or to menu nav (latch hysteresis + axis-dominance
  gating so wobble and up/down-vs-left/right confusion are gone).
- **OLED menu = a TOP-ALIGNED SCROLLING list at a fixed readable font, NOT wrapped text.** The
  ViewModel exposes the open menu as `menuRows: {label, value, active}[]` (the controller maps
  `fields()` to rows; empty when closed). `Screen.tsx` (`MenuList`) renders rows at a constant
  pitch (`baseFont = h*0.14`, readable), the first row at a FIXED y near the glass top
  (`top = gh*0.46 - lineStep/2`) so a menu whose field count changes (the MODE menu: PLAY=2
  rows, ARP=4) does NOT shift its rows up/down when you cycle it (was centered -> jumped). Only
  the WINDOW of rows that fit the glass is drawn, kept around the cursor so the active field is
  always visible; off-screen rows are occluded by simply not being rendered (no bleed over the
  bezel). An over-long single row (ARP's `PATTERN UPDOWN`) shrinks just enough to stay on ONE
  line instead of wrapping. **Scroll-hint chevrons are TRIANGLE MESHES (`Chevron`), NOT font
  glyphs**: ShareTechMono has no `▲`/`▼` (U+25B2/25BC), and a MISSING glyph makes
  troika-three-text fetch a fallback font from a CDN - a stalled request that leaves iOS
  Safari's tab loading-bar spinning (the canonical "bundle the font locally" gotcha, here
  triggered by a glyph the bundled font lacks). History: this layout replaced (a) the original
  one-line `screenSmall` + drei `Text` `maxWidth`-wrap that overflowed + overlapped once GLIDE
  made the KEY menu 6 fields, and (b) a first fix that auto-SHRANK the font to fit all rows -
  too small to read. `screenBig`/`screenSmall` remain for the NON-menu OLED (key/chord +
  patch/mode, loop transport). Mono `OLED_FONT` makes the leading-space cursor column align.
- **Pressing yellow (sound) while a menu is open CLOSES the menu** (`pressSound` -> `closeMenu`
  first) so the OLED shows the instrument (or inversion) flashing instead of staying on the
  KEY/MODE menu list - the three top buttons (gray KEY menu, red MODE menu, yellow sound) are
  peers, so invoking yellow leaves menu mode.

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
STRINGS/CLARINET/BELL(FM)/ORGAN/PLUCK, BLOOM (a held supersaw chord that pitch-blooms
on the attack), plus the **"huge" family**: SUPER/HUGE/NEON
(supersaws) + REESE/NEURO (DnB bass). `SynthPort.noteOn` takes an optional per-note
patch (the looper plays each track on its own instrument). Also a `drum(name)` method
synthesizing percussion (no samples). A global `setBend(cents)` pitch bend (LEAD mode)
and `setGlide(seconds)` portamento: a MONO note (`freqs.length === 1`, i.e. LEAD/DRONE)
glides its oscillator frequencies from `lastMonoFreq` over the glide time
(`glideFreq` exponential-ramps each osc, unison/sub/FM scaled by ratio). The `GLIDE`
KEY-menu field (OFF/SLOW/MED/FAST, `glideSeconds`) drives it - HiChord-style toggle+speed.
- **UNISON engine** (for the huge presets): `Patch.unison` stacks N detuned copies of
  osc1 across `unisonDetune` cents, panned across the stereo field by `unisonSpread`
  (StereoPannerNode -> the output + recorded loops are STEREO); `Patch.sub` adds a clean
  sine an octave down for weight; `Patch.drive` inserts a tanh soft-clip WaveShaperNode
  before the filter for Reese/neuro grit (the sub bypasses it). Defaults (unison 1, no
  sub/drive) reproduce the classic 1-2 osc voices unchanged. Stacked levels are kept sane
  by `1/sqrt(unison)` per-osc gain + the master limiter. Play the basses with OCTAVE down.
- **Pitch shapes** (`setVoiceFreq`): every osc frequency at note-on can ramp UP to the
  target. Two sources: PORTAMENTO/glide (from the previous mono note, `setGlide`) and the
  per-note PITCH-ATTACK bloom (`Patch.pitchAttack` semitones below over `pitchAttackTime`,
  the supersaw-stab "sweeps in" sound - BLOOM uses it). Glide wins if both are active.
- **LEGATO morph** (`retune`): the joystick morphs a held chord IN PLACE, no re-pluck. Each
  Voice now stores `oscRatios` (each osc's freq / fundamental) + `fund` (current fundamental),
  so `retune(voiceId, freqs)` exponential-ramps every sounding oscillator from its old to its
  new pitch (~25ms, click-free) WITHOUT touching the VCA gain envelope. Overlapping notes
  glide; added notes (triad -> 7th) `makeVoice`-attack in; dropped notes `releaseVoice` out.
  The controller routes ALL re-voicing of a sounding chord (joystick morph `setQuality`,
  `springToTriad`, inversions, key/scale edits via `revoiceHeld`; DRONE latch; LEAD note) through
  `retune`/`triggerLead(true)` instead of `noteOn`, so editing a held chord never re-attacks.
  Engine test `webAudioSynth.test.ts` pins it (fake AudioContext logs param scheduling: a
  same-count morph re-ramps oscillator frequency + adds ZERO new VCA gain ops; adding a note
  attacks exactly one voice).

**Looper (`infrastructure/audio/webAudioLooper.ts`, `AudioLooper` port)**: an AUDIO
loop recorder, NOT an event looper (rewritten 2026-06-29 - the old event `Looper` +
`RecordingSynth` + `Ticker`/`RafTicker` are gone). It records the synth's RENDERED
output off a tap on the live bus, so every layer is frozen the instant it is captured -
switching patch / play-mode / fx afterward never alters a recorded loop (the old event
looper replayed through the live synth, so changing to STRUM made an old loop strum -
the bug this fixes). Output routing (`webAudioSynth.ts`): the live graph (master dry +
reverb + delay + chorus) sums into `liveSum`, which the looper taps via a
ScriptProcessorNode; loop playback + the metronome go through a SEPARATE `loopSum` bus
that joins after the tap, so loops are never re-recorded and overdubs layer cleanly.
`audioGraph()` exposes `{ctx, live, loopOut}`. **The looper is a MODE (aligned to the
HiChord): the joystick CLICK first ENTERS looper mode (`active` flag, no recording yet);
subsequent clicks run the record cycle; joystick UP EXITS the mode + stops playback (loops
kept, halted; `exit()`), DOWN pauses/restarts (`toggleStop()`), LEFT/RIGHT selects a track,
long-press clears the selected track (all gated on `active`). The OLED looper view only
shows while `active`.** State machine, once IN the mode (joystick click):
idle -> armed (waiting; nothing recorded) -> rec (the FIRST key starts the master
capture, no leading silence) -> play; play -> rec overdubs a new layer. Track 1 sets the
loop length, SNAPPED to a whole number of BARS (`BEATS_PER_BAR=4`, round-to-nearest, min
1 bar). **Quantization is on the NOTES, not the captured audio**: the length is
`anchor -> lastActivity` (the last note on/off, via `noteStarted`/`noteEnded` from the
controller's press/release), so a long release/reverb tail past the bar line does NOT add
a bar - the tail is `wrapAdd`-folded back into the loop start (bleeds into bar 1) instead.
**Overdub has a 4-beat count-in**: hitting record over a loop silences the layers, clicks
4 beats (OLED `COUNT n`), then restarts ALL layers from bar 1 AND begins capturing on the
downbeat (so a new layer never waits a whole loop to align). **A re-press DURING the count-in
CANCELS the overdub** (`cancelOverdub`): it abandons the new layer, kills the scheduled
count-in clicks + the pending capture-start, and resumes the existing layers - so rapid
joystick presses can't finalize near-empty bogus tracks or stack overlapping metronomes (the
master arm already cancels via `armed -> idle`). **Click oscillators are cancellable**:
`click()` tracks each `{osc, at}` in `clickNodes`, and `killFutureClicks()` (called from
`stopMetronome`, `cancelOverdub`, `resetAll`) stops the ones not yet fired, so a cancelled
arm/count-in never leaves audio-scheduled blips to overlap the next one. **Joystick DOWN =
stop** (`toggleStop`, `useSynth` navLooper down-flick at the forgiving `LOOP_STOP_THRESHOLD`
= 0.55, NOT the 0.85 menu-nav push - 0.85 felt unreliable and a gentle pull got misread as a
tap = an accidental overdub): halts all layers; down again restarts them from the top (bar 1)
via the retained per-layer `buffer`. **STOPPED is FLASHED once** (`looperStop` -> `flash`,
~900ms) then the OLED falls back to the live key/scale with a compact `STOP n LOOPS` marker -
it does NOT persist (a persistent `STOPPED` obstructed the screen). Each layer is
`{source, gain, buffer}` so it can be re-started (stop/resume, overdub count-in) and faded on
delete. **Overdub capture is CONTIGUOUS** (accumulate blocks from the downbeat,
truncate to one loop via `copyInto`) - NOT the old per-block phase-write off
`playbackTime`, whose jitter left discontinuities a sharp drum hit exposed. **Zombie-track
invariant**: `restartTracks` STOPS the current sources before recreating them, and
`stopped` is reset to false on every (re)start (finalizeMaster/Overdub, count-in downbeat,
startOverdub). Skipping either let a stale `stopped` flag send a stop to the resume branch,
which recreated sources while the old ones kept playing UNTRACKED - an un-stoppable loop.
Regression: `webAudioLooper.test.ts` "never leaves a zombie source". The synth output is
`comp (glue) -> limiter (brickwall, -1.5dB / 20:1 / 0.5ms attack) -> destination` so stacked
loop layers + live drums can't hard-clip (sample-drum playback gain also dropped 0.9->0.7).
A metronome clicks while arming + recording (routed to loopSum so it is never captured),
accenting every bar's downbeat anchored to the loop's first-note grid (NOT the overdub's
own metronome anchor - keying off that dropped the accent on later tracks); its interval
locks to the loop's own beat once a loop exists. **Per-layer management** (`selectTrack`/
contextual `clear`): while a loop plays + no pad is held, joystick LEFT/RIGHT picks the
selected layer (`useSynth` `navTrack`, horizontal-only flick), long-press clears the
SELECTED layer (master/layer-0 clears all, since it defines the length), and each layer
is a `{source, gain, buffer}` track faded out on delete (no click). A `displayTimer`
re-emits while playing so the OLED shows a live `BAR x.y` transport (bar.beat) on the big
line, with `TRK sel/n loopBars` on the small line. 6 tracks. The OLED shows LOOP ARMED /
REC n / BAR x.y + TRK n. Controller calls `looper.noteStarted()` on every pad press
(begins an armed take) + `looper.setBpm()` + `selectLoopTrack()`. WebAudioLooper unit
tests (fake AudioContext drives capture/overdub/metronome/select-clear) + controller
wiring tests.

**Knob multitouch (`ui/three/Knob.tsx`)**: the joystick owns its pointer via the shared
`joyPointer` ref; the pads ignore that pointer. Because R3F's mesh-level pointerup for the
joystick finger can be swallowed when a second finger (a held chord) is down and the
release lands over a pad, a **window-level `pointerup`/`pointercancel` fallback** (keyed on
`joyPointer.current`) force-ends the drag - the browser always fires it, so the stick can
never stay stuck deflected. **Pads use the same safety net** (`useSynth`): a pad's
pointer-up is raycast-delivered, so a finger lifting off a pad EDGE or in a gap (easy when
swiping fast) left the note held with no release = a stuck key. A window
`pointerup`/`pointercancel` listener calls `controller.releasePad(String(pointerId))` for
the lifted pointer (idempotent: a normal over-pad release already cleared it; a non-pad
pointer id isn't a held voice). Reproduced + verified via CDP touch (7 stuck oscillators ->
0, only the chorus LFO remains). `WebAudioSynth` resumes the AudioContext after backgrounding via THREE signals, because
visibilitychange alone is NOT enough on iOS Safari (a programmatic resume is ignored until
a real gesture, and the ctx can sit 'interrupted'): `visibilitychange`->visible, ctx
`statechange` (both gated on `document.visibilityState === 'visible'` so a backgrounded tab
isn't kept alive), and a window `pointerdown`/`touchstart`/`keydown` (the reliable iOS path
- the next tap resumes it).

**Drums (`DRUM` play mode)**: the 7 pads map to a kit (`drumForDegree`). Drum hits are
rendered audio like everything else, so they are captured by the audio looper too. **Each
pad SELF-CHOKES (is mono): retriggering a pad cuts its OWN previous hit (8ms fade, no click)
so a long tail - clap / 808 / open-hat - never plays over itself; different pads do not
choke each other.** It is a `drumVoices: Map<DrumName, stopFn>` in `webAudioSynth.ts`, applied
in BOTH the sample path (`playBuffer`) and the synth path (`synthDrum`); since hits are the
rendered audio the looper taps, the choked (non-overlapping) version is what gets recorded.
Kits via the DRUM-mode KIT
field: TIGHT/BOX808/BOX909 are SYNTHESIZED (`KIT_TUNE` factors); TRAP/LOFI are CC0
SAMPLE kits. Samples live in `public/drums/<kit>/<pad>.mp3` (one mono mp3 per pad),
lazy-loaded + decoded on first use (`SAMPLE_KITS` map in `webAudioSynth.ts`; fetch
`drums/<folder>/<pad>.mp3`, cache by `${kit}:${pad}`); the first hit before a kit
finishes loading falls back to the synth so it is never silent. All bundled samples
are CC0 1.0 (public domain, no attribution) - the TRAP/LOFI kits are CC0 sounds picked
from Freesound (see `public/drums/CREDITS.txt`).

Adding a genre kit: pull CC0 sounds from the Freesound API (filter `license:"Creative
Commons 0"`), drop the chosen mp3s into `public/drums/<kit>/`, and add the kit to `DrumKit`
+ `DRUM_KITS` + `SAMPLE_KITS`. LICENSING IS THE WHOLE TRICK: ONLY bundle CC0 / public-domain
(or CC-BY *with* a credit line in `public/drums/CREDITS.txt`) - the deployed site is
public-reachable, so "royalty-free for your tracks" packs are NOT redistributable. Most
"free drum kits" online fail this; CC0 ones skew to loops + partial packs. (Operator
API-key + audition-deploy details live in the private infra repo.)

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
  `preventDefault` on the canvas's raw `touchstart`/`touchmove` (in `Stage.tsx`
  `onCreated`) - pads/joystick run on pointer events so they are unaffected. (CSS +
  selectstart/gesturestart + locked viewport are kept as extra layers.)

Next, in rough priority: joystick EXTENDED/CHROMATIC modes (richer voicings + key
modulation); a step sequencer; Web-MIDI out; presets; chord-lock; more effects
(tremolo/filter/flanger); games. Source: github.com/Zamua/jamshelf.

## Persistence (local only; survives reload + PWA reopen)

Two narrow PORTS in `application/persistence.ts`, so the app/domain never touch Web
Storage / IndexedDB directly (swapping the backing store = one new adapter + one wiring
line in `useSynth`):

- **Durable settings -> `SettingsStore` -> localStorage** (`LocalStorageSettingsStore`,
  key `jamshelf/<id>/settings`, e.g. `jamshelf/hiclone/settings`). The `SettingsSnapshot` is the durable musical state ONLY
  (key/scale/octave/patch/bpm/volume/theme/mode/arp+rate/strum/bass/fx/glide/drumKit/
  inversion) - never transient state (held pads, morph quality, menu, power, transport).
  The controller `restoreSettings` on construct + `maybeSave()` from `publish()` (a single
  seam; de-duped via `lastSavedJson` so a joystick morph or transport tick never writes).
  **Validation is a PURE function `coerceSettings(raw, fallback)`** (not buried in the
  controller): every field is checked against its domain value set / clamped to range, so
  a stale or hand-edited payload can never set invalid state - it falls back per-field.
- **Recorded loops -> `LooperStore` -> IndexedDB** (`IndexedDbLooperStore`, db `jamshelf`,
  store `looper`, key = the instrument namespace e.g. `hiclone`). Audio is seconds of stereo Float32 per layer (megabytes) =
  too big for localStorage, so it lives in IndexedDB (stores typed arrays natively, large
  quota). `WebAudioLooper.serialize()` snapshots every layer's PCM + loop geometry;
  `persist()` saves on each track-set change (finalizeMaster/Overdub, layer delete) and
  `store.clear()` on a full wipe. On construct the looper async-loads + `restore()`s the
  layers **STOPPED** (mode `play`, `stopped: true`) so nothing blasts on open and iOS's
  no-audio-before-gesture rule is respected; a joystick-down starts them. Restore is a
  no-op if a fresh recording already began (a race guard).

Both stores are fully guarded (absent / disabled / over-quota / corrupt -> degrade to "no
saved state", never throw). Tests: `persistence.test.ts` (coerce + controller save/restore
with a `MemorySettingsStore`), `webAudioLooper.test.ts` "persists + restores STOPPED" (fake
`LooperStore` round-trip); the real IndexedDB adapter + restore-on-load was browser-verified.

## Current state

DDD skeleton + real Web Audio engine + the modeled/assembled 3D device + Phase 1
play modes are built, tested, and deployed. Domain
+ controller are unit-tested. Active work: closing HiChord feature gaps (see roadmap)
and iterative polish. See `README.md` for the human-facing overview.
