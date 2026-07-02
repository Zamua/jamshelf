import { RoundedBox, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { FRONT_Z } from './layout';
import { PALETTE, dim } from './palette';
import { LABEL_FONT } from './fonts';

interface SwitchProps {
  x: number;
  y: number;
  w: number;
  h: number;
  on: boolean;
  power: boolean;
  label: string;
  onToggle: () => void;
  resume: () => void;
}

// A two-position toggle switch (vibrato, power): a dark recessed slot with a cream nub that sits
// UP when on, DOWN when off. Tapping anywhere on it toggles. Fires on onPointerUp (R3F onClick is
// dead on touch in this app).
export function Switch({ x, y, w, h, on, power, label, onToggle, resume }: SwitchProps) {
  const nubY = on ? h * 0.22 : -h * 0.22;
  const nub = power ? PALETTE.switchNub : dim(PALETTE.switchNub, 0.4);

  const tap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    onToggle();
  };

  return (
    <group position={[x, y, FRONT_Z]}>
      {/* dark housing */}
      <RoundedBox args={[w, h, 0.08]} radius={0.05} smoothness={3} onPointerDown={(e) => e.stopPropagation()} onPointerUp={tap} onPointerCancel={tap}>
        <meshStandardMaterial color={PALETTE.switchBody} metalness={0.3} roughness={0.6} />
      </RoundedBox>
      {/* the sliding nub */}
      <RoundedBox args={[w * 0.72, h * 0.4, 0.12]} radius={0.04} smoothness={3} position={[0, nubY, 0.06]}>
        <meshStandardMaterial color={nub} metalness={0.1} roughness={0.5} />
      </RoundedBox>
      {/* label below */}
      <Text
        font={LABEL_FONT}
        position={[0, -h * 0.72, 0.02]}
        fontSize={0.13}
        color={power ? PALETTE.ink : dim(PALETTE.ink, 0.3)}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.04}
      >
        {label}
      </Text>
    </group>
  );
}
