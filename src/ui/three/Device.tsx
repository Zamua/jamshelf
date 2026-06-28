import { useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { DeviceProps } from './deviceProps';
import {
  BODY,
  BRAND,
  CAM_DIST,
  CAM_FOV,
  FLOOR_Z,
  FRONT_Z,
  JOY_DOTS,
  KNOB,
  MENU,
  MIC,
  SCREEN,
  SPEAKER,
  padSpecs,
} from './layout';
import { BODY_THEMES, PALETTE, isLightBody, powerColor } from './palette';
import { OLED_FONT } from './font';
import { BRAND_FONT } from './brandFont';
import { Chassis } from './Chassis';
import { Pad } from './Pad';
import { Screen } from './Screen';
import { Knob } from './Knob';
import { Speaker } from './Speaker';
import { MenuButton } from './MenuButton';
import { TopEdge } from './TopEdge';

// The real modeled HiChord-style device, assembled from component meshes in a
// landscape group. Purely presentational: it renders the ViewModel and fires raw
// input through the handlers.
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

  const theme = BODY_THEMES[vm.themeIndex % BODY_THEMES.length];
  const holeColor = powerColor(theme.floor, vm.power);
  // labels/wordmark flip to dark ink on a light shell (Aluminum) for contrast.
  const lightBody = isLightBody(theme.body);
  const labelColor = vm.power ? (lightBody ? '#33363d' : '#9fb0e8') : '#3a3d44';
  const brandColor = vm.power ? (lightBody ? '#23262d' : '#eef1f8') : '#4a4d54';

  // 8 decorative dots ringing the joystick at the cardinals + diagonals.
  const joyDots = Array.from({ length: JOY_DOTS.count }, (_, i) => {
    const a = (i / JOY_DOTS.count) * Math.PI * 2; // 0,45,90,... -> N/S/E/W + diagonals
    return [KNOB.x + Math.cos(a) * JOY_DOTS.r, KNOB.y + Math.sin(a) * JOY_DOTS.r] as const;
  });

  return (
    <group scale={scale}>
      <Chassis power={vm.power} theme={theme} />

      {pads.map((p) => (
        <Pad
          key={p.degree}
          degree={p.degree}
          x={p.x}
          y={p.y}
          w={p.w}
          h={p.h}
          platW={p.platW}
          platH={p.platH}
          platDx={p.platDx}
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
        z={FLOOR_Z}
        w={SCREEN.w}
        h={SCREEN.h}
      />

      <Knob
        x={KNOB.x}
        y={KNOB.y}
        z={KNOB.z}
        power={vm.power}
        rim={theme.deep}
        basin={theme.floor}
        handlers={handlers}
      />

      {/* ring of 8 dots around the joystick */}
      {joyDots.map(([dx, dy], i) => (
        <mesh key={i} position={[dx, dy, FRONT_Z + 0.012]}>
          <circleGeometry args={[JOY_DOTS.dot, 14]} />
          <meshStandardMaterial color={holeColor} metalness={0.15} roughness={0.7} />
        </mesh>
      ))}

      <Speaker x={SPEAKER.x} y={SPEAKER.y} z={SPEAKER.z} r={SPEAKER.r} hole={holeColor} />

      {/* mic pinhole + label, below the joystick */}
      <mesh position={[MIC.x, MIC.y, FRONT_Z + 0.012]}>
        <circleGeometry args={[MIC.r, 16]} />
        <meshStandardMaterial color={'#0a1130'} metalness={0.3} roughness={0.6} />
      </mesh>
      <Text
        font={OLED_FONT}
        position={[MIC.x, MIC.labelY, FRONT_Z + 0.01]}
        fontSize={0.13}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        mic
      </Text>

      {/* HiClone branding, top-left (rounded wordmark font) */}
      <Text
        font={BRAND_FONT}
        position={[BRAND.x, BRAND.y, FRONT_Z + 0.01]}
        fontSize={0.26}
        color={brandColor}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.005}
      >
        {BRAND.text}
      </Text>

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
