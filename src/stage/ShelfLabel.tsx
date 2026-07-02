import { Text } from '@react-three/drei';
import { MARKER_FONT } from './markerFont';

// A scrawled-marker paper label taped to the FRONT of the wall shelf, just under the device.
// A real, STATIC object in the 3D room (not HTML chrome) - it never moves or fades. The play
// view is framed forward on the desk (PLAY_POS/CAM/TGT in Stage) so the shelf + this label
// sit off the top of frame at the desk; here we just place it. The plank front face is at
// z ~ 0.70; the paper sits a hair proud of it and hangs down below the plank.
export function ShelfLabel({ text, x = 0, scale = 1 }: { text: string; x?: number; scale?: number }) {
  return (
    <group position={[x, 1.6, 0.74]} rotation={[0.05, 0, -0.055]} scale={scale}>
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
