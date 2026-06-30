# jamshelf

**▸ Live: https://4jzmz9uv.hostthis.dev**

A 3D **shelf of playable instruments** in the browser. The shelf displays each instrument as a 3D model; tap one to open and play it. Pick up the **HiClone**, a chord groovebox: press the pads to play the seven chords that always sound good together in your chosen key, morph them live with the joystick, loop and layer, and rotate the device in 3D to inspect it. Inspired by the HiChord pocket chord synth; this is an independent, unbranded homage.

Built with **React + react-three-fiber + TypeScript + Vite + react-router**, organized with domain-driven design. Each instrument is a self-contained module (a pure music-theory core, a Web Audio adapter behind a port, and a 3D UI) lazy-loaded on demand; the shelf renders from an instrument registry. More instruments (and, later, linked multi-instrument "jam" sessions) to come.

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

## Saved state

Your settings (key, scale, octave, sound, fx, glide, tempo, drum kit, volume, shell color, ...)
and your recorded loops persist locally and come back on reload, including when installed as a
PWA. Settings live in `localStorage`; the loop audio lives in IndexedDB (it is too large for
`localStorage`). Restored loops come back paused: pull the joystick down to start them. Nothing
leaves the device.

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

The production build is a fully static site (no backend). Build it, then serve `dist/` from any static host:

```
npm run build
# serve dist/ on your host of choice
```

The only host requirement is **SPA fallback**: unknown client routes (e.g. `/hiclone`) must serve `index.html` so deep links resolve to the app.

## License

Source code: [MIT](./LICENSE). Bundled assets keep their own licenses (fonts under the SIL Open Font License 1.1, drum samples under CC0 1.0); see [NOTICE.md](./NOTICE.md). The HiClone is an independent, unbranded homage to the HiChord and is not affiliated with or endorsed by its makers.
