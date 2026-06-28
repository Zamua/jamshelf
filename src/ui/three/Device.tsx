import { useThree } from '@react-three/fiber';
import type { DeviceProps } from './deviceProps';
import {
  BODY,
  CAM_DIST,
  CAM_FOV,
  FRONT_Z,
  KNOB,
  MENU,
  MIC,
  SCREEN,
  SPEAKER,
  padSpecs,
} from './layout';
import { PALETTE } from './palette';
import { Chassis } from './Chassis';
import { Pad } from './Pad';
import { Screen } from './Screen';
import { Knob } from './Knob';
import { Speaker } from './Speaker';
import { MenuButton } from './MenuButton';
import { TopEdge } from './TopEdge';

// The real modeled HiChord-style device, assembled from component meshes in a
// landscape group: a beveled anodized-blue chassis with a recessed key well, 7
// interleaved cream pads, the joystick, the OLED, the octagon speaker, the 3
// colored menu buttons, and the top-edge hardware. Purely presentational: it
// renders the ViewModel and fires raw input through the handlers.
export function Device({ vm, handlers }: DeviceProps) {
  const pads = padSpecs();

  // Fit-scale the device to the viewport. We derive the visible extent from the
  // fixed App camera (CAM_DIST/CAM_FOV) and the DOM pixel size, NOT the live
  // OrbitControls dolly, so inspect-mode zoom is not fought by a rescale.
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const visH = 2 * CAM_DIST * Math.tan((CAM_FOV * Math.PI) / 180 / 2);
  const visW = visH * aspect;
  const scale = Math.min(1, (visW * 0.94) / BODY.w, (visH * 0.94) / BODY.h);

  return (
    <group scale={scale}>
      <Chassis power={vm.power} />

      {pads.map((p) => (
        <Pad
          key={p.degree}
          degree={p.degree}
          x={p.x}
          y={p.y}
          w={p.w}
          h={p.h}
          lit={vm.litPads.includes(p.degree)}
          power={vm.power}
          handlers={handlers}
        />
      ))}

      <Screen
        big={vm.screenBig}
        small={vm.screenSmall}
        power={vm.power}
        x={SCREEN.x}
        y={SCREEN.y}
        z={SCREEN.z}
        w={SCREEN.w}
        h={SCREEN.h}
      />

      <Knob x={KNOB.x} y={KNOB.y} z={KNOB.z} power={vm.power} handlers={handlers} />

      <Speaker x={SPEAKER.x} y={SPEAKER.y} z={SPEAKER.z} r={SPEAKER.r} power={vm.power} />

      {/* mic pinhole, just above the joystick */}
      <mesh position={[MIC.x, MIC.y, FRONT_Z + 0.012]}>
        <circleGeometry args={[MIC.r, 16]} />
        <meshStandardMaterial color={'#0a1130'} metalness={0.3} roughness={0.6} />
      </mesh>

      <MenuButton
        x={MENU.gray}
        y={MENU.y}
        size={MENU.size}
        color={PALETTE.gray}
        icon="key"
        power={vm.power}
        onPress={handlers.onKey}
        resume={handlers.resume}
      />
      <MenuButton
        x={MENU.yellow}
        y={MENU.y}
        size={MENU.size}
        color={PALETTE.yellow}
        icon="wave"
        power={vm.power}
        onPress={handlers.onSound}
        resume={handlers.resume}
      />
      <MenuButton
        x={MENU.red}
        y={MENU.y}
        size={MENU.size}
        color={PALETTE.red}
        icon="clock"
        power={vm.power}
        onPress={handlers.onTempo}
        resume={handlers.resume}
      />

      <TopEdge power={vm.power} handlers={handlers} />
    </group>
  );
}

export { Chassis } from './Chassis';
export { Pad } from './Pad';
export { Screen } from './Screen';
export { Knob } from './Knob';
export { Speaker } from './Speaker';
export { MenuButton } from './MenuButton';
export { TopEdge } from './TopEdge';

export default Device;
