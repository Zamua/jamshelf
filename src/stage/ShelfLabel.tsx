import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';
import { Text } from '@react-three/drei';
import { MARKER_FONT } from './markerFont';

// A scrawled-marker paper label taped to the FRONT of the wall shelf, just under the device.
// It is a real object in the 3D room (not HTML chrome). The shelf plank's front face is at
// z ~ 0.70; the paper sits a hair proud of it and hangs down below the plank.
//
// It belongs to the shelf, so when the device floats to the desk it RECEDES (scales away)
// rather than fade like a UI element - the play view is a top-down shot of the desk and the
// paper's edge would otherwise poke into the top of frame. It grows back on the shelf.
export function ShelfLabel({ text, mode }: { text: string; mode: 'shelf' | 'play' }) {
  const ref = useRef<Group>(null);

  // Cold deep-link straight to /<id> starts in play: begin hidden so it doesn't flash.
  useLayoutEffect(() => {
    if (ref.current && mode === 'play') ref.current.scale.setScalar(0);
  }, []); // once, on mount

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = mode === 'shelf' ? 1 : 0;
    const s = MathUtils.damp(g.scale.x, target, 9, dt); // framerate-independent ease
    g.scale.setScalar(s);
    g.visible = s > 0.02;
  });

  return (
    <group ref={ref} position={[0, 1.6, 0.74]} rotation={[0.05, 0, -0.055]}>
      {/* the paper */}
      <mesh>
        <planeGeometry args={[1.72, 0.66]} />
        <meshStandardMaterial color="#f1e3c3" roughness={0.94} metalness={0} />
      </mesh>
      {/* a strip of masking tape across the top */}
      <mesh position={[0, 0.31, 0.003]} rotation={[0, 0, 0.05]}>
        <planeGeometry args={[0.52, 0.17]} />
        <meshStandardMaterial color="#ded0a4" roughness={0.85} transparent opacity={0.58} />
      </mesh>
      {/* the scrawled instrument name */}
      <Text
        font={MARKER_FONT}
        position={[0, -0.02, 0.006]}
        fontSize={0.32}
        color="#4a3826"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.01}
      >
        {text}
      </Text>
    </group>
  );
}
