import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Midi } from '../../domain/keyboard';
import type { DeviceHandlers } from '../deviceProps';
import { PALETTE } from './palette';

interface KeyProps {
  midi: Midi;
  xw: number; // world center x
  yw: number; // world center y
  ww: number; // world width
  hw: number; // world height
  z: number; // world z (plate surface)
  lit: boolean;
  power: boolean;
  handlers: DeviceHandlers;
}

// A single flat key on the etched plate: an invisible hit plane that plays the note (and slurs on
// drag-over), plus a translucent glow plane that lights the pressed key. The key art itself is
// painted into the plate's canvas texture; this only handles input + the lit highlight.
export function Key({ midi, xw, yw, ww, hw, z, lit, power, handlers }: KeyProps) {
  const glow = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    if (!glow.current) return;
    const target = lit && power ? 0.55 : 0;
    glow.current.opacity += (target - glow.current.opacity) * Math.min(1, delta * 22);
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.resume();
    handlers.onKeyDown(midi);
  };
  // R3F re-raycasts every pointer move (implicit capture during a drag), so onPointerEnter fires as
  // the stylus slides onto another key. Gate on a held button for the slur.
  const enter = (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons > 0) handlers.onKeyDown(midi);
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.onKeyUp();
  };

  return (
    <group position={[xw, yw, z]}>
      {/* glow overlay (lit key) */}
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[ww, hw]} />
        <meshBasicMaterial ref={glow} color={PALETTE.glow} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* invisible hit plane */}
      <mesh onPointerDown={down} onPointerEnter={enter} onPointerUp={up} onPointerCancel={up}>
        <planeGeometry args={[ww, hw]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
