import { useEffect, useRef } from 'react';
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { FRONT_Z } from './layout';
import { MAX_BPM, MIN_BPM } from '../../application/state';
import { PALETTE, dim } from './palette';
import { LABEL_FONT } from './fonts';

interface KnobProps {
  x: number;
  y: number;
  r: number;
  bpm: number;
  power: boolean;
  onTempo: (bpm: number) => void;
  resume: () => void;
}

const SWEEP = (140 * Math.PI) / 180; // +/- travel
const SENS = 0.6; // bpm per px of horizontal drag

// The TEMPO knob: a dark knob with an orange indicator; grab + drag horizontally to change the BPM.
// Shows the current BPM below.
export function Knob({ x, y, r, bpm, power, onTempo, resume }: KnobProps) {
  const drag = useRef<{ startX: number; startBpm: number } | null>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      onTempo(d.startBpm + (e.clientX - d.startX) * SENS);
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
  }, [onTempo]);

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    drag.current = { startX: e.nativeEvent.clientX, startBpm: bpmRef.current };
  };

  const frac = (bpm - MIN_BPM) / (MAX_BPM - MIN_BPM); // 0..1
  const angle = -SWEEP + frac * SWEEP * 2;
  const body = power ? '#17181a' : dim('#17181a', 0.3);
  const ind = power ? PALETTE.orange : PALETTE.orangeDim;

  return (
    <group position={[x, y, FRONT_Z]}>
      <mesh onPointerDown={down} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r * 0.92, 0.18, 32]} />
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.5} />
      </mesh>
      <group rotation={[0, 0, angle]}>
        <mesh position={[0, r * 0.55, 0.12]}>
          <boxGeometry args={[r * 0.1, r * 0.6, 0.04]} />
          <meshStandardMaterial color={ind} emissive={ind} emissiveIntensity={power ? 0.4 : 0} toneMapped={false} />
        </mesh>
      </group>
      <Text font={LABEL_FONT} position={[0, -r - 0.16, 0.02]} fontSize={0.16} color={power ? PALETTE.ink : PALETTE.inkDim} anchorX="center" anchorY="middle">
        {`${bpm} BPM`}
      </Text>
      <Text font={LABEL_FONT} position={[0, r + 0.16, 0.02]} fontSize={0.11} color={power ? PALETTE.orange : PALETTE.orangeDim} anchorX="center" anchorY="middle" letterSpacing={0.1}>
        TEMPO
      </Text>
    </group>
  );
}
