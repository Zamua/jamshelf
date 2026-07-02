import { useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { DrumVoice } from '../../domain/sequencer';
import { FRONT_Z } from './layout';
import { PALETTE, dim } from './palette';

interface LevelKnobProps {
  voice: DrumVoice;
  x: number;
  y: number;
  r: number;
  level: number; // 0..1
  power: boolean;
  onLevel: (voice: DrumVoice, level: number) => void;
  resume: () => void;
}

const SWEEP = (140 * Math.PI) / 180;
const SENS = 0.006; // level per px of VERTICAL drag (up = louder)

// A per-voice LEVEL knob (the 808's per-instrument level). Grab + drag UP to raise the level; a
// small orange indicator shows the setting. One sits above each voice column.
export function LevelKnob({ voice, x, y, r, level, power, onLevel, resume }: LevelKnobProps) {
  const drag = useRef<{ startY: number; startLevel: number } | null>(null);
  const lvlRef = useRef(level);
  lvlRef.current = level;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const next = Math.max(0, Math.min(1, d.startLevel + (d.startY - e.clientY) * SENS));
      onLevel(voice, next);
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
  }, [onLevel, voice]);

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    drag.current = { startY: e.nativeEvent.clientY, startLevel: lvlRef.current };
  };

  const angle = -SWEEP + level * SWEEP * 2;
  const body = power ? '#161719' : dim('#161719', 0.3);
  const ind = power ? PALETTE.orange : PALETTE.orangeDim;

  return (
    <group position={[x, y, FRONT_Z]}>
      <mesh onPointerDown={down} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r * 0.9, 0.14, 24]} />
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.5} />
      </mesh>
      <group rotation={[0, 0, angle]}>
        <mesh position={[0, r * 0.5, 0.1]}>
          <boxGeometry args={[r * 0.13, r * 0.62, 0.03]} />
          <meshStandardMaterial color={ind} emissive={ind} emissiveIntensity={power ? 0.5 : 0} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
