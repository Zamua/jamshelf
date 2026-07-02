import type { ComponentType, ReactNode } from 'react';

// The metadata the shelf shows for an instrument. The stage hosts the instrument's
// LIVE device directly (the shelf and the play view are one continuous scene), so the
// manifest no longer carries a separate display model or play component. When a second
// instrument lands, this is also where the stage will learn which device to mount.
export interface InstrumentManifest {
  // URL slug AND storage namespace (stable, lowercase, no spaces), e.g. 'hiclone'.
  readonly id: string;
  // Display name on the shelf + the route, e.g. 'HiClone'.
  readonly name: string;
  // One-line description shown on the shelf caption.
  readonly blurb: string;
  // Does it persist state locally (a groovebox with memory)?
  readonly hasMemory: boolean;
  // Accent color for shelf styling (the pedestal glow / wordmark).
  readonly accent: string;
}

// Everything the jamshelf host needs to mount ONE instrument. Each instrument bundles its
// manifest, its React hook, its 3D device, and its optional chrome into a self-typed module;
// the host (Experience) reads the registry, mounts every module's device on the shelf, and
// wires the active one's play chrome. This is the seam that lets the shelf host N instruments
// without the host importing any single instrument. Typed over the instrument's own VM /
// Handlers (the registry stores them behind `AnyInstrumentModule`).
// A tempo-aware instrument's hook exposes this so a rig's shared transport can drive it: one
// BPM across the rig, and (for a sequenced instrument like the drum machine) a global play/stop.
// Instruments with no tempo (the StyloClone) simply omit it.
export interface InstrumentTransport {
  setBpm(bpm: number): void;
  getBpm(): number;
  play(): void; // start this instrument's sequencer (no-op if it has none)
  stop(): void;
  isPlaying(): boolean; // is this instrument's sequencer running (false if it has none)
}

export interface InstrumentModule<VM = unknown, H = unknown> {
  readonly manifest: InstrumentManifest;
  // The instrument's React hook. `enabled` gates always-on side effects (desktop keyboard
  // play) so only the ACTIVE instrument responds when several are mounted on the shelf. The
  // optional `transport` in the return lets a rig sync this instrument's tempo + play state.
  useInstrument(enabled: boolean): { vm: VM; handlers: H; transport?: InstrumentTransport };
  // The 3D device (purely presentational: renders the VM, fires raw input via the handlers).
  readonly Device: ComponentType<{ vm: VM; handlers: H }>;
  // Optional how-to-play overlay (HTML), shown in the play view.
  readonly Manual?: ComponentType<{ open: boolean; onClose: () => void }>;
  // What to do when a tap misses every mesh (release the sounding note / spring the joystick).
  releaseOnMiss(handlers: H): void;
  // Wire the help toggle into the handlers so the instrument's `onHelpToggle` opens the Manual
  // (the Manual is host-owned React state). Returns handlers with the toggle patched in.
  withHelpToggle(handlers: H, toggle: () => void): H;
  // Optional instrument-specific play-chrome tool buttons (HTML), e.g. the HiClone color swatch.
  PlayTools?: ComponentType<{ vm: VM; handlers: H }>;
}

// The registry stores modules with erased VM/Handlers types; the host wires vm+handlers from
// the SAME module so they stay consistent at the mount site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyInstrumentModule = InstrumentModule<any, any>;

// A convenience alias for the optional play-chrome render.
export type PlayToolsNode = ReactNode;
