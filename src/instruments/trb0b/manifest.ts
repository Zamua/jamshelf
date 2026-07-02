import type { InstrumentManifest } from '../../shared/instrument';

// The TR-B0B: an unbranded TR-808-style step-sequencer drum machine. Shelf-facing metadata only.
export const trb0bManifest: InstrumentManifest = {
  id: 'trb0b',
  name: 'TR-B0B',
  blurb: '16-step drum machine: program a beat, lock it to the jam',
  hasMemory: true,
  accent: '#e8823a', // the 808 orange
};
