# chord-synth

A playable, 3D chord synthesizer that runs in the browser. Press the pads to play the seven chords that always sound good together in your chosen key, morph them live with the joystick, and rotate the device in 3D to inspect it. Inspired by the HiChord pocket chord synth; this is an independent, unbranded homage.

Built with **React + react-three-fiber + TypeScript + Vite**, organized with domain-driven design (a pure music-theory core, a Web Audio adapter behind a port, and a 3D UI).

## Run it

```
npm install
npm run dev
```

Then open the printed local URL. Held best in landscape; multi-touch on a phone or tablet.

## How to play

- **7 pads** play the 7 diatonic chords of the current key and scale. Any combination sounds good.
- **Joystick** morphs the held chord while you push it (7th, sus, 6th, jazz, ...); release to settle back to a triad.
- **Gray** opens the key menu (root, scale, octave). **Yellow** cycles the sound. **Red** is tap-tempo.
- **3D** button rotates the device for inspection; **?** opens the in-app guide.

## Scripts

| | |
| --- | --- |
| `npm run dev` | dev server with HMR |
| `npm run build` | type-check + production build to `dist/` |
| `npm run preview` | serve the production build |
| `npm run test` | run the unit tests |
| `npm run lint` | lint |

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the full layer breakdown. In short: `domain/` holds pure, tested music theory; `application/` holds the controller + ports; `infrastructure/` holds the Web Audio adapter; `ui/` holds the React + react-three-fiber device.

## Deploy

The production build is a static site. Deploy `dist/` anywhere that serves static files; for example, as a hostthis static site:

```
npm run build
tar czf - dist/ | ssh hostthis.dev
```
