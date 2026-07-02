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

// A faithful vertical slide switch (POWER, VIBRATO) on the white strip: a dark recessed track with
// a silver nub that sits DOWN when on, UP when off (matching the Stylophone's OFF-top/ON-bottom
// power slider). Tapping anywhere toggles. Fires on onPointerUp (R3F onClick is dead on touch).
export function Switch({ x, y, w, h, on, power, label, onToggle, resume }: SwitchProps) {
  const nubY = on ? -h * 0.2 : h * 0.2;
  const nub = power ? PALETTE.switchNub : dim(PALETTE.switchNub, 0.4);
  const ink = power ? PALETTE.keyNum : dim(PALETTE.keyNum, 0.3);

  const tap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    onToggle();
  };

  return (
    <group position={[x, y, FRONT_Z]}>
      {/* dark recessed track */}
      <RoundedBox args={[w, h, 0.05]} radius={0.04} smoothness={3} onPointerDown={(e) => e.stopPropagation()} onPointerUp={tap} onPointerCancel={tap}>
        <meshStandardMaterial color={PALETTE.switchTrack} metalness={0.3} roughness={0.6} />
      </RoundedBox>
      {/* the sliding silver nub */}
      <RoundedBox args={[w * 0.78, h * 0.44, 0.11]} radius={0.03} smoothness={3} position={[0, nubY, 0.05]}>
        <meshStandardMaterial color={nub} metalness={0.5} roughness={0.4} />
      </RoundedBox>
      {/* label below the switch (kept inside the white strip, narrow so the two don't collide) */}
      <Text
        font={LABEL_FONT}
        position={[0, -h * 0.64, 0.02]}
        fontSize={0.088}
        color={ink}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0}
      >
        {label}
      </Text>
    </group>
  );
}
