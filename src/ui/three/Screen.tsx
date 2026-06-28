import { Text, RoundedBox } from '@react-three/drei';
import { PALETTE } from './palette';

interface ScreenProps {
  big: string;
  small: string;
  power: boolean;
  x: number;
  y: number;
  z: number;
}

// The OLED: a near-black recessed glass panel with amber text. screenBig is the
// large line (key + scale, or a flashed chord/quality name); screenSmall is the
// small line (patch + bpm). Goes dark when the device is powered off.
export function Screen({ big, small, power, x, y, z }: ScreenProps) {
  const amberBig = power ? PALETTE.amber : '#1c1f25';
  const amberSmall = power ? '#d59433' : '#181b21';

  return (
    <group position={[x, y, z]}>
      {/* raised black bezel (proud of the slab so the frame is visible) */}
      <RoundedBox args={[1.78, 0.74, 0.12]} radius={0.04} smoothness={4} position={[0, 0, 0.03]}>
        <meshStandardMaterial color="#05060a" metalness={0.3} roughness={0.6} />
      </RoundedBox>

      {/* emissive glass */}
      <mesh position={[0, 0, 0.095]}>
        <planeGeometry args={[1.62, 0.6]} />
        <meshStandardMaterial
          color={PALETTE.oled}
          emissive={power ? '#0c1a44' : '#020306'}
          emissiveIntensity={power ? 0.45 : 0.05}
          metalness={0}
          roughness={0.2}
        />
      </mesh>

      <Text
        position={[0, 0.09, 0.11]}
        fontSize={0.26}
        color={amberBig}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.5}
        letterSpacing={0.04}
      >
        {big}
      </Text>
      <Text
        position={[0, -0.17, 0.11]}
        fontSize={0.12}
        color={amberSmall}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.5}
        letterSpacing={0.03}
      >
        {small}
      </Text>
    </group>
  );
}
