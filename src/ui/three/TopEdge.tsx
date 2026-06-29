import { useRef, useState } from 'react';
import { Text, RoundedBox } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { DeviceHandlers } from './deviceProps';
import { BODY } from './layout';
import { PALETTE, powerColor } from './palette';
import { OLED_FONT } from './font';

interface TopEdgeProps {
  power: boolean;
  handlers: DeviceHandlers;
}

const TOP_Y = BODY.h / 2; // 1.65: the physical top face of the slab

// Hardware on the actual top edge of the slab (so it reads when the device is
// rotated in inspect): a red power slider, a ridged volume thumbwheel, a 3.5mm
// jack and a USB-C port, with tiny etched labels.
export function TopEdge({ power, handlers }: TopEdgeProps) {
  const wheel = useRef<THREE.Mesh>(null);
  const last = useRef(0);
  const [volDrag, setVolDrag] = useState(false);

  const startVol = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.resume();
    last.current = NaN; // seeded on the first tracking-plane move (correct surface)
    setVolDrag(true);
  };
  const moveVol = (e: ThreeEvent<PointerEvent>) => {
    if (Number.isNaN(last.current)) {
      last.current = e.point.x;
      return;
    }
    const dx = e.point.x - last.current;
    last.current = e.point.x;
    if (wheel.current) wheel.current.rotation.y += dx * 4;
    handlers.onVolume(dx);
  };
  const endVol = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setVolDrag(false);
  };

  const togglePower = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.onPower();
  };

  const labelColor = power ? '#9fb0e8' : '#3a3d44';
  const dark = '#0a0c14';

  // The slab's top face spans the full body depth; its center is behind the front
  // face. Shift the whole hardware row back so it sits centered on the top edge
  // (depth-wise) rather than hugging the front.
  return (
    <group position={[0, 0, -0.12]}>
      {/* POWER SLIDER (red) */}
      <group position={[-1.7, TOP_Y + 0.01, 0.02]} onPointerDown={togglePower}>
        {/* recessed slot */}
        <mesh>
          <boxGeometry args={[0.34, 0.05, 0.16]} />
          <meshStandardMaterial color={dark} metalness={0.3} roughness={0.6} />
        </mesh>
        {/* sliding nub: sits forward when on, back when off */}
        <mesh position={[power ? 0.07 : -0.07, 0.04, 0]}>
          <boxGeometry args={[0.13, 0.07, 0.13]} />
          <meshStandardMaterial
            color={powerColor(PALETTE.red, power)}
            emissive={power ? '#5a0f08' : '#000000'}
            emissiveIntensity={power ? 0.5 : 0}
            metalness={0.2}
            roughness={0.45}
          />
        </mesh>
      </group>
      <Text
        position={[-1.7, TOP_Y + 0.03, 0.16]}
        rotation={[-Math.PI / 2, 0, 0]}
        font={OLED_FONT}
        fontSize={0.07}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        PWR
      </Text>

      {/* VOLUME WHEEL (ridged, draggable) */}
      <group position={[-0.75, TOP_Y - 0.07, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh
          ref={wheel}
          onPointerDown={startVol}
          onPointerUp={endVol}
          onPointerCancel={endVol}
        >
          {/* low radial segment count + flatShading reads as a knurled wheel */}
          <cylinderGeometry args={[0.13, 0.13, 0.42, 16, 1]} />
          <meshStandardMaterial
            color={powerColor('#9aa0a8', power)}
            metalness={0.55}
            roughness={0.35}
            flatShading
          />
        </mesh>
      </group>
      <Text
        position={[-0.75, TOP_Y + 0.03, 0.18]}
        rotation={[-Math.PI / 2, 0, 0]}
        font={OLED_FONT}
        fontSize={0.07}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        VOL
      </Text>

      {/* 3.5mm JACK: a slightly-proud dark socket. It sits ABOVE the slab's top face
          (not flush with it) so no surface is coplanar with the slab - coplanar faces
          here were the source of the top-edge z-fighting shimmer. */}
      <group position={[0.7, TOP_Y - 0.022, 0]}>
        <mesh>
          <cylinderGeometry args={[0.1, 0.1, 0.09, 22]} />
          <meshStandardMaterial color={powerColor('#15181f', power)} metalness={0.45} roughness={0.5} />
        </mesh>
        {/* darker bore RECESSED below the socket rim so it reads as a hole */}
        <mesh position={[0, 0.018, 0]}>
          <cylinderGeometry args={[0.055, 0.05, 0.02, 18]} />
          <meshStandardMaterial color="#050608" metalness={0.3} roughness={0.7} />
        </mesh>
      </group>

      {/* USB-C PORT: a slightly-proud dark slot (above the slab face, not coplanar) */}
      <RoundedBox
        args={[0.28, 0.08, 0.12]}
        radius={0.03}
        smoothness={3}
        position={[1.7, TOP_Y - 0.018, 0]}
      >
        <meshStandardMaterial color={powerColor('#0a0c12', power)} metalness={0.45} roughness={0.5} />
      </RoundedBox>
      <Text
        position={[1.7, TOP_Y + 0.03, 0.16]}
        rotation={[-Math.PI / 2, 0, 0]}
        font={OLED_FONT}
        fontSize={0.06}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
      >
        USB-C
      </Text>

      {/* invisible drag-tracking plane while turning the volume wheel */}
      {volDrag && (
        <mesh position={[0, 1.0, 1.5]} onPointerMove={moveVol} onPointerUp={endVol} onPointerCancel={endVol}>
          <planeGeometry args={[30, 30]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
