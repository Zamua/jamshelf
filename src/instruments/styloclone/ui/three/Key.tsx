import { useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { DeviceHandlers } from '../deviceProps';
import type { KeySpec } from './layout';
import { PALETTE, dim } from './palette';

interface KeyProps {
  spec: KeySpec;
  lit: boolean;
  power: boolean;
  z: number; // plate front z (keys sit on the plate)
  handlers: DeviceHandlers;
}

// A single metal key contact on the silver plate. The stylus (pointer) touching it fires
// onKeyDown(midi); dragging the stylus onto another key while pressed fires onKeyDown for the
// new key too (the slur) - the controller de-dupes same-key repeats and is monophonic, so the
// last-touched key wins. The lit key gets a subtle warm glow (a play affordance; the real
// contacts don't light) and depresses a hair.
export function Key({ spec, lit, power, z, handlers }: KeyProps) {
  const press = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const accidental = spec.row === 'accidental';

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 20);
    if (press.current) {
      // press animation: a small dip into the plate. The OUTER group holds the key's resting z;
      // this inner group's local z animates 0 -> -0.05, so the key never sinks out of view.
      const targetZ = lit ? -0.05 : 0;
      press.current.position.z += (targetZ - press.current.position.z) * k;
    }
    if (mat.current) {
      const target = lit && power ? 0.85 : 0;
      mat.current.emissiveIntensity += (target - mat.current.emissiveIntensity) * k;
    }
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.resume();
    handlers.onKeyDown(spec.midi);
  };
  // R3F re-raycasts every pointer move (implicit capture during a touch drag), so onPointerEnter
  // fires as the stylus slides onto another key. Gate on a held button for the slur.
  const enter = (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons > 0) handlers.onKeyDown(spec.midi);
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.onKeyUp();
  };

  const base = accidental ? PALETTE.keyDark : PALETTE.keySilver;
  const color = power ? base : dim(base, 0.4);

  return (
    <group position={[spec.x, spec.y, z]}>
      <group ref={press}>
        <RoundedBox
          args={[spec.w, spec.h, 0.06]}
          radius={0.02}
          smoothness={3}
          onPointerDown={down}
          onPointerEnter={enter}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <meshStandardMaterial
            ref={mat}
            color={color}
            emissive={PALETTE.glow}
            emissiveIntensity={0}
            metalness={accidental ? 0.5 : 0.82}
            roughness={accidental ? 0.5 : 0.32}
          />
        </RoundedBox>
      </group>
    </group>
  );
}
