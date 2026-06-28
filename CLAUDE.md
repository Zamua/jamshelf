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

## Current state

Scaffold complete: DDD skeleton, working build + 6 passing domain tests + a rendering R3F placeholder device (crude boxes). The real work (real Web Audio engine, the modeled+assembled 3D device, the full UI/controls/overlays, glissando + multi-touch input) is being built out across parallel workflow lanes against the contracts above. See `README.md` for the human-facing overview.
