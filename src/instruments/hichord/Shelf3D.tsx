import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
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

// The HiClone as it sits on the shelf: the same 3D model, non-interactive, gently
// swaying so its depth + metallic sheen read at a glance (a full spin would show the
// plain back, so it sways around face-on instead).
export default function Shelf3D() {
  const g = useRef<Group>(null);
  useFrame((state) => {
    if (g.current) g.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.42;
  });
  return (
    <group ref={g}>
      <Device vm={DISPLAY_VM} handlers={NOOP} />
    </group>
  );
}
