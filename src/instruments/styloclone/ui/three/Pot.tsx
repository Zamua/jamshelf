import { useEffect, useRef } from 'react';
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { FRONT_Z } from './layout';
import { PALETTE, dim } from './palette';
import { LABEL_FONT } from './fonts';

interface PotProps {
  x: number;
  y: number;
  r: number;
  value: number; // 0..1 (display position)
  power: boolean;
  label: string;
  onChange: (value: number) => void; // absolute 0..1, clamped
  resume: () => void;
}

const SWEEP = (135 * Math.PI) / 180; // +/- 135deg travel (270 total)
const SENS = 0.006; // value change per px of horizontal drag

// A rotary pot (tune, volume): a dark knob with a cream indicator line pointing to the current
// value. Grab + drag horizontally to turn it (a full pass across the device is the whole range).
// Absolute value is clamped 0..1 and emitted; the Device maps that to cents / gain.
export function Pot({ x, y, r, value, power, label, onChange, resume }: PotProps) {
  const drag = useRef<{ startX: number; startVal: number } | null>(null);
  const valRef = useRef(value);
  valRef.current = value;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const next = Math.max(0, Math.min(1, d.startVal + (e.clientX - d.startX) * SENS));
      onChange(next);
    };
    const end = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [onChange]);

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    drag.current = { startX: e.nativeEvent.clientX, startVal: valRef.current };
  };

  const angle = -SWEEP + value * SWEEP * 2; // 0 -> -135deg, 1 -> +135deg
  const body = power ? PALETTE.potBody : dim(PALETTE.potBody, 0.4);
  const ind = power ? PALETTE.potIndicator : dim(PALETTE.potIndicator, 0.4);

  return (
    <group position={[x, y, FRONT_Z]}>
      {/* knob body: a cylinder rotated so its circular face points at the camera (+Z) */}
      <mesh onPointerDown={down} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r * 0.94, 0.16, 28]} />
        <meshStandardMaterial color={body} metalness={0.35} roughness={0.55} />
      </mesh>
      {/* indicator line, rotates with the value */}
      <group rotation={[0, 0, angle]}>
        <mesh position={[0, r * 0.5, 0.11]}>
          <boxGeometry args={[r * 0.12, r * 0.7, 0.04]} />
          <meshStandardMaterial color={ind} metalness={0.1} roughness={0.5} />
        </mesh>
      </group>
      {/* label below */}
      <Text
        font={LABEL_FONT}
        position={[0, -r - 0.18, 0.02]}
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
