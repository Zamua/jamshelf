import { Text, RoundedBox } from '@react-three/drei';
import { PALETTE } from './palette';
import { WELL_DEPTH } from './layout';
import { OLED_FONT } from './font';

interface ScreenProps {
  big: string;
  small: string;
  power: boolean;
  x: number;
  y: number;
  z: number; // the floor of the screen's recess (FLOOR_Z)
  w: number;
  h: number;
}

// The OLED: a black panel filling its square recess, with amber text on emissive
// glass set just below the face so it reads as a sunken display. screenBig is the
// large line (key + scale, or a flashed chord name); screenSmall is the small
// line (patch + bpm). Goes dark when powered off.
export function Screen({ big, small, power, x, y, z, w, h }: ScreenProps) {
  const amberBig = power ? PALETTE.amber : '#1c1f25';
  const amberSmall = power ? '#d59433' : '#181b21';
  const gw = w - 0.12;
  const gh = h - 0.12;

  return (
    <group position={[x, y, z]}>
      {/* black backing in the lower part of the recess (its front sits BEHIND the
          glass so it never occludes the display) */}
      <RoundedBox
        args={[w, h, WELL_DEPTH - 0.04]}
        radius={0.05}
        smoothness={4}
        position={[0, 0, (WELL_DEPTH - 0.04) / 2]}
      >
        <meshStandardMaterial color="#05060a" metalness={0.3} roughness={0.6} />
      </RoundedBox>

      {/* emissive glass, recessed below the face but in front of the backing */}
      <mesh position={[0, 0, WELL_DEPTH - 0.025]}>
        <planeGeometry args={[gw, gh]} />
        <meshStandardMaterial
          color={PALETTE.oled}
          emissive={power ? '#0c1a44' : '#020306'}
          emissiveIntensity={power ? 0.45 : 0.05}
          metalness={0}
          roughness={0.2}
        />
      </mesh>

      <Text
        font={OLED_FONT}
        position={[0, gh * 0.2, WELL_DEPTH - 0.018]}
        fontSize={h * 0.22}
        color={amberBig}
        anchorX="center"
        anchorY="middle"
        maxWidth={gw}
        lineHeight={1}
        letterSpacing={0.02}
      >
        {big}
      </Text>
      <Text
        font={OLED_FONT}
        position={[0, -gh * 0.32, WELL_DEPTH - 0.018]}
        fontSize={h * 0.14}
        color={amberSmall}
        anchorX="center"
        anchorY="middle"
        maxWidth={gw}
        letterSpacing={0.02}
      >
        {small}
      </Text>
    </group>
  );
}
