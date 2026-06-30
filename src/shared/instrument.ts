import type { ComponentType, LazyExoticComponent } from 'react';

// What the shelf + router need to know about an instrument, WITHOUT importing its
// internals. Each instrument registers one of these; the shelf renders from the list
// and the router mounts `Play` at /<id>. Adding an instrument = drop a folder under
// src/instruments/ + add its manifest to the registry. The future jam-session /rig
// routes will compose these the same way.
export interface InstrumentManifest {
  // URL slug AND storage namespace (stable, lowercase, no spaces), e.g. 'hichord'.
  readonly id: string;
  // Display name on the shelf + the route, e.g. 'HiClone'.
  readonly name: string;
  // One-line description for the shelf pedestal label.
  readonly blurb: string;
  // Does it persist state locally (a groovebox with memory)? Surfaced on the shelf.
  readonly hasMemory: boolean;
  // The full interactive play experience, LAZY-loaded so the instrument's (large)
  // audio + scene bundle only loads when you actually open it.
  readonly Play: LazyExoticComponent<ComponentType>;
  // Warm the lazy `Play` chunk ahead of time (the shelf calls this so the device is
  // ready by the time the zoom transition lands - no "loading" flash). The dynamic
  // import is cached, so this + `Play` share one fetch.
  readonly preload?: () => void;
  // A non-interactive 3D model for the shelf. Kept separate from `Play` so the shelf
  // can show the instrument without pulling in its audio engine. Omit for a
  // not-yet-built ("coming soon") slot.
  readonly Shelf3D?: ComponentType;
  // Accent color for the shelf (pedestal glow / label), so the shelf never has to
  // reach into the instrument for styling.
  readonly accent: string;
}
