import { useRef } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { FRONT_Z, STEP_ROW } from './layout';
import { PALETTE, dim } from './palette';
import { LABEL_FONT } from './fonts';

interface StepButtonProps {
  index: number;
  x: number;
  color: string;
  active: boolean; // this step is on for the selected voice
  playhead: boolean; // the running playhead is on this step
  power: boolean;
  onToggle: (i: number) => void;
  resume: () => void;
}

// One of the 16 step buttons: a colored cap (bright when active, dim when off) with an LED above
// (lit when active; a warm flash when the playhead passes) and the step number below. Tap toggles.
export function StepButton({ index, x, color, active, playhead, power, onToggle, resume }: StepButtonProps) {
  const cap = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, dt) => {
    const k = Math.min(1, dt * 20);
    if (cap.current) {
      const target = active ? -0.03 : 0;
      cap.current.position.z += (target - cap.current.position.z) * k;
    }
    if (led.current) {
      const target = !power ? 0 : playhead ? 1.8 : active ? 1.0 : 0;
      led.current.emissiveIntensity += (target - led.current.emissiveIntensity) * k;
    }
  });

  const capColor = power ? (active ? color : dim(color, PALETTE.stepDim)) : dim(color, 0.7);
  // LED is DARK until the step is active (orange) or the playhead passes (warm white)
  const ledColor = playhead ? PALETTE.playhead : active ? PALETTE.led : PALETTE.ledOff;

  const tap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    onToggle(index);
  };

  return (
    <group position={[x, STEP_ROW.y, FRONT_Z]}>
      {/* LED above */}
      <mesh position={[0, STEP_ROW.ledY - STEP_ROW.y, 0.03]}>
        <circleGeometry args={[0.045, 16]} />
        <meshStandardMaterial ref={led} color={ledColor} emissive={ledColor} emissiveIntensity={0} toneMapped={false} />
      </mesh>
      {/* the colored cap */}
      <group ref={cap}>
        <RoundedBox
          args={[STEP_ROW.w, STEP_ROW.h, 0.12]}
          radius={0.03}
          smoothness={3}
          position={[0, 0, 0.06]}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={tap}
          onPointerCancel={tap}
        >
          <meshStandardMaterial color={capColor} metalness={0.1} roughness={0.5} />
        </RoundedBox>
      </group>
      {/* number below */}
      <Text
        font={LABEL_FONT}
        position={[0, STEP_ROW.numY - STEP_ROW.y, 0.03]}
        fontSize={0.13}
        color={power ? PALETTE.ink : PALETTE.inkDim}
        anchorX="center"
        anchorY="middle"
      >
        {String(index + 1)}
      </Text>
    </group>
  );
}
