import { Device } from './ui/three/Device';
import type { DeviceHandlers } from './ui/three/deviceProps';
import type { ViewModel } from './application/state';

// The shelf model is non-interactive: every handler is a no-op (taps are caught by
// the shelf's pedestal target, not the device).
const NOOP: DeviceHandlers = {
  resume() {},
  onPadDown() {},
  onPadMove() {},
  onPadUp() {},
  onJoyMove() {},
  onJoyEnd() {},
  onJoyClick() {},
  onJoyHold() {},
  onKey() {},
  onSound() {},
  onTempo() {},
  onPower() {},
  onVolume() {},
  onInspectToggle() {},
  onHelpToggle() {},
  onSwapColor() {},
};

// A static, powered-on default so the device looks alive on the shelf (lit screen,
// no menu). The real state only exists once you open the instrument.
const DISPLAY_VM: ViewModel = {
  root: 0,
  scale: 'MAJOR',
  octave: 0,
  quality: 'TRIAD',
  patch: 'SAW',
  bpm: 120,
  volume: 0.8,
  power: true,
  inspect: false,
  themeIndex: 0,
  mode: 'PLAY',
  menuOpen: false,
  menuKind: 'KEY',
  looper: {
    mode: 'idle',
    recTrack: -1,
    trackCount: 0,
    selected: 0,
    loopBars: 0,
    bar: 0,
    beat: 0,
    stopped: false,
    countdown: 0,
    posFraction: 0,
  },
  litPads: [],
  screenBig: 'C MAJ',
  screenSmall: 'SAW  PLAY',
  menuRows: [],
};

// The HiClone as it sits on the shelf: the same 3D model, non-interactive and static
// (it is resting/propped on the shelf; the shelf scene's parallax gives the life).
export default function Shelf3D() {
  return <Device vm={DISPLAY_VM} handlers={NOOP} />;
}
