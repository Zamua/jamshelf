import type { InstrumentManifest } from '../shared/instrument';
import { hichordManifest } from './hichord/manifest';

// Every instrument on the shelf. The shelf renders from this list and the router
// mounts each one at /<id>. Add an instrument by appending its manifest here.
export const INSTRUMENTS: readonly InstrumentManifest[] = [hichordManifest];

export function instrumentById(id: string): InstrumentManifest | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}
