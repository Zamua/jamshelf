import type { InstrumentManifest } from '../../shared/instrument';

// The StyloClone: a faithful, unbranded recreation of the 1968 Dubreq Stylophone. Shelf-facing
// metadata only; the stage mounts its live device (see the instrument module + Stage).
export const stylocloneManifest: InstrumentManifest = {
  id: 'styloclone',
  name: 'StyloClone',
  blurb: 'Monophonic stylus synth: touch the 20-key plate to buzz',
  hasMemory: true,
  accent: '#d94f3d', // the classic Stylophone red
};
