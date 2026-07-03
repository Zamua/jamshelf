import type { InstrumentManifest } from '../../shared/instrument';

// The LoopClone: an unbranded RC-505-style 5-track loop station. Shelf-facing metadata only.
export const loopcloneManifest: InstrumentManifest = {
  id: 'loopclone',
  name: 'LoopClone',
  blurb: '5-track loop station: layer + loop the whole jam',
  hasMemory: true,
  accent: '#e0453a', // the record-LED red
};
