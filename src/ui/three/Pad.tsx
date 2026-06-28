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
  w: number;
  h: number;
  platW: number;
  platH: number;
  platDx: number;
  lit: boolean;
  power: boolean;
  handlers: DeviceHandlers;
}

// A single cream keycap with a slightly-raised platform layered on its face. For
// the top (sharp) keys the platform is an inset square offset to the inside, so
// it reads like a piano sharp between the bottom keys. The visual state (depress
// + emissive glow) is driven by `lit` (the controller decides which pads are
// held), so press, multi-touch and glissando all light correctly.
export function Pad({ degree, x, y, w, h, platW, platH, platDx, lit, power, handlers }: PadProps) {
  const group = useRef<THREE.Group>(null);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 18); // frame-rate independent smoothing
    if (group.current) {
      const targetZ = lit ? PAD.pressZ : PAD.restZ;
      group.current.position.z += (targetZ - group.current.position.z) * k;
    }
    const targetE = lit && power ? 0.95 : 0;
    for (const m of mats.current) {
      if (m) m.emissiveIntensity += (targetE - m.emissiveIntensity) * k;
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

  const base = power ? PALETTE.cream : dim(PALETTE.cream);
  const top = power ? PALETTE.creamHi : dim(PALETTE.creamHi);

  return (
    <group
      ref={group}
      position={[x, y, PAD.restZ]}
      onPointerDown={down}
      onPointerEnter={enter}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {/* keycap base */}
      <RoundedBox args={[w, h, PAD.d]} radius={0.07} smoothness={4}>
        <meshStandardMaterial
          ref={(el) => {
            mats.current[0] = el;
          }}
          color={base}
          emissive={'#ffe6a8'}
          emissiveIntensity={0}
          metalness={0.05}
          roughness={0.45}
        />
      </RoundedBox>

      {/* slightly-raised platform on the keycap face */}
      <RoundedBox
        args={[platW, platH, 0.07]}
        radius={0.035}
        smoothness={4}
        position={[platDx, 0, PAD.d / 2]}
      >
        <meshStandardMaterial
          ref={(el) => {
            mats.current[1] = el;
          }}
          color={top}
          emissive={'#ffe6a8'}
          emissiveIntensity={0}
          metalness={0.05}
          roughness={0.4}
        />
      </RoundedBox>
    </group>
  );
}
