import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { PAD_LAYOUT, type Degree } from '../../domain/music';
import type { DeviceProps } from './deviceProps';

// PLACEHOLDER device. The 3D lane replaces this with the real modeled +
// assembled HiChord-style device (chassis, pads that depress, a turning knob,
// the OLED, octagon speaker, menu buttons, top-edge hardware) matched to the
// Cosmic Blue photos. This stub renders just enough to be playable end-to-end:
// a body, the 7 pads in the bottom=1,3,5,7 / top=2,4,6 interleaved layout, and
// the OLED text. Pads are interactive via the handlers.
export function Device({ vm, handlers }: DeviceProps) {
  const pads = useMemo(() => {
    const padW = 0.9;
    const gap = 0.12;
    const items: { degree: Degree; x: number; y: number }[] = [];
    // bottom row: 4 pads
    PAD_LAYOUT.bottom.forEach((degree, i) => {
      items.push({ degree, x: (i - 1.5) * (padW + gap), y: -0.7 });
    });
    // top row: 3 pads, offset to sit between the bottom pads
    PAD_LAYOUT.top.forEach((degree, i) => {
      items.push({ degree, x: (i - 1) * (padW + gap), y: 0.55 });
    });
    return items;
  }, []);

  const press = (e: ThreeEvent<PointerEvent>, degree: Degree) => {
    e.stopPropagation();
    handlers.resume();
    handlers.onPadDown(String(e.pointerId), degree);
  };
  const release = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.onPadUp(String(e.pointerId));
  };

  return (
    <group>
      {/* body */}
      <mesh position={[0, 0, -0.2]}>
        <boxGeometry args={[5.2, 3.4, 0.5]} />
        <meshStandardMaterial color={vm.power ? '#1f41d6' : '#16205e'} roughness={0.5} />
      </mesh>

      {/* OLED text */}
      <Text position={[-1.4, 1.25, 0.12]} fontSize={0.32} color="#ffb638" anchorX="center">
        {vm.screenBig}
      </Text>

      {/* pads */}
      {pads.map(({ degree, x, y }) => {
        const lit = vm.litPads.includes(degree);
        return (
          <mesh
            key={degree}
            position={[x + 0.7, y, lit ? 0.05 : 0.12]}
            onPointerDown={(e) => press(e, degree)}
            onPointerUp={release}
            onPointerCancel={release}
          >
            <boxGeometry args={[0.84, 1.0, 0.18]} />
            <meshStandardMaterial color={lit ? '#fff4d0' : '#ece4cf'} roughness={0.4} />
          </mesh>
        );
      })}
    </group>
  );
}
