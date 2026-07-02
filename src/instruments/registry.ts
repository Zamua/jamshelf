import type { AnyInstrumentModule, InstrumentManifest } from '../shared/instrument';
import { hicloneModule } from './hiclone/module';
import { stylocloneModule } from './styloclone/module';
import { trb0bModule } from './trb0b/module';

// Every instrument on the shelf, as a full module (manifest + hook + device + chrome). The
// shelf renders from this list and the router mounts each one at /<id>. Add an instrument by
// appending its module here.
export const INSTRUMENTS: readonly AnyInstrumentModule[] = [hicloneModule, stylocloneModule, trb0bModule];

export function instrumentById(id: string): AnyInstrumentModule | undefined {
  return INSTRUMENTS.find((m) => m.manifest.id === id);
}

// The shelf metadata list (manifests), for anything that only needs display data.
export const MANIFESTS: readonly InstrumentManifest[] = INSTRUMENTS.map((m) => m.manifest);
