import { Text, RoundedBox } from '@react-three/drei';
import { PALETTE } from './palette';

interface ScreenProps {
  big: string;
  small: string;
  power: boolean;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
}

// The OLED: a near-black recessed glass panel with amber text. screenBig is the
// large line (key + scale, or a flashed chord/quality name); screenSmall is the
// small line (patch + bpm). Goes dark when the device is powered off.
export function Screen({ big, small, power, x, y, z, w, h }: ScreenProps) {
  const amberBig = power ? PALETTE.amber : '#1c1f25';
  const amberSmall = power ? '#d59433' : '#181b21';
  const gw = w - 0.14;
  const gh = h - 0.12;

  return (
    <group position={[x, y, z]}>
      {/* raised black bezel (proud of the slab so the frame is visible) */}
      <RoundedBox args={[w, h, 0.12]} radius={0.04} smoothness={4} position={[0, 0, 0.03]}>
        <meshStandardMaterial color="#05060a" metalness={0.3} roughness={0.6} />
      </RoundedBox>

      {/* emissive glass */}
      <mesh position={[0, 0, 0.095]}>
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
        position={[0, gh * 0.16, 0.11]}
        fontSize={h * 0.4}
        color={amberBig}
        anchorX="center"
        anchorY="middle"
        maxWidth={gw}
        letterSpacing={0.04}
      >
        {big}
      </Text>
      <Text
        position={[0, -gh * 0.28, 0.11]}
        fontSize={h * 0.19}
        color={amberSmall}
        anchorX="center"
        anchorY="middle"
        maxWidth={gw}
        letterSpacing={0.03}
      >
        {small}
      </Text>
    </group>
  );
}
