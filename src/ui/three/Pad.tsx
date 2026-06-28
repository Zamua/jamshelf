import { useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Degree } from '../../domain/music';
import type { DeviceHandlers } from './deviceProps';
import { PAD } from './layout';
import { PALETTE, dim } from './palette';

interface PadProps {
  degree: Degree;
  x: number;
  y: number;
  lit: boolean;
  power: boolean;
  handlers: DeviceHandlers;
}

// A single cream keycap. The visual state (depress + emissive glow) is driven by
// `lit` (the controller decides which pads are held), so press, multi-touch and
// glissando all light correctly. The mesh fires raw, semantic-free input.
export function Pad({ degree, x, y, lit, power, handlers }: PadProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 18); // frame-rate independent smoothing
    if (mesh.current) {
      const targetZ = lit ? PAD.pressZ : PAD.restZ;
      mesh.current.position.z += (targetZ - mesh.current.position.z) * k;
    }
    if (mat.current) {
      const targetE = lit && power ? 0.95 : 0;
      mat.current.emissiveIntensity += (targetE - mat.current.emissiveIntensity) * k;
    }
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.resume();
    handlers.onPadDown(String(e.pointerId), degree);
  };
  // R3F re-raycasts every pointer move (even during a touch drag, since the
  // canvas keeps implicit capture), so onPointerEnter fires as a finger/mouse
  // slides onto another pad. Gate on a held button for glissando.
  const enter = (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons > 0) handlers.onPadMove(String(e.pointerId), degree);
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.onPadUp(String(e.pointerId));
  };

  return (
    <RoundedBox
      ref={mesh}
      args={[PAD.w, PAD.h, PAD.d]}
      radius={0.08}
      smoothness={4}
      position={[x, y, PAD.restZ]}
      onPointerDown={down}
      onPointerEnter={enter}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <meshStandardMaterial
        ref={mat}
        color={power ? PALETTE.cream : dim(PALETTE.cream)}
        emissive={'#ffe6a8'}
        emissiveIntensity={0}
        metalness={0.05}
        roughness={0.42}
      />
    </RoundedBox>
  );
}
