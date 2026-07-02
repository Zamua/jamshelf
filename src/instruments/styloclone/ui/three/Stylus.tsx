import { Text } from '@react-three/drei';
import { CHANNEL, FRONT_Z, STYLUS } from './layout';
import { PALETTE } from './palette';
import { LABEL_FONT } from './fonts';

// The tethered stylus resting horizontally in its channel, brass tip pointing right, with a
// "STYLUS" label on the left (matching the reissue). Decorative - you play with a finger/mouse.
export function Stylus() {
  const { x, y, len, r } = STYLUS;
  const zc = FRONT_Z + 0.02; // sits in the recessed channel

  return (
    <group>
      {/* the recessed channel behind the pen */}
      <mesh position={[CHANNEL.x, CHANNEL.y, FRONT_Z - 0.01]}>
        <planeGeometry args={[CHANNEL.w, CHANNEL.h]} />
        <meshStandardMaterial color={PALETTE.bodyEdge} metalness={0.2} roughness={0.7} />
      </mesh>
      {/* STYLUS label on the left of the channel */}
      <Text
        font={LABEL_FONT}
        position={[-1.95, CHANNEL.y, FRONT_Z + 0.005]}
        fontSize={0.1}
        color={PALETTE.ink}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        STYLUS
      </Text>
      {/* the pen barrel, lying horizontally, tip pointing right */}
      <group position={[x, y, zc + 0.05]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r, r * 0.82, len, 16]} />
          <meshStandardMaterial color={PALETTE.stylus} metalness={0.45} roughness={0.4} />
        </mesh>
        {/* brass tip */}
        <mesh position={[len / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[r * 0.95, r * 2.4, 16]} />
          <meshStandardMaterial color={PALETTE.stylusTip} metalness={0.85} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}
