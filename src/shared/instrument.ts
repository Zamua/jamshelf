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
