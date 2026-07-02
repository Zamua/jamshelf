import { RoundedBox } from '@react-three/drei';
import { BODY, BODY_RADIUS, FRONT_Z, STRIP } from './layout';
import { PALETTE, dim } from './palette';

// The black ABS slab + the white lower strip that holds the keyboard + switches. Structural only;
// the grille, badge, stylus, keyboard and switches are layered on top by the Device.
export function Chassis({ power }: { power: boolean }) {
  const body = power ? PALETTE.body : dim(PALETTE.body, 0.3);
  const strip = power ? PALETTE.strip : dim(PALETTE.strip, 0.3);

  return (
    <group>
      {/* the black body slab */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={BODY_RADIUS} smoothness={5}>
        <meshStandardMaterial color={body} metalness={0.18} roughness={0.55} />
      </RoundedBox>

      {/* the white lower strip, sitting just proud of the black face */}
      <RoundedBox
        args={[STRIP.w, STRIP.h, 0.06]}
        radius={0.05}
        smoothness={4}
        position={[STRIP.x, STRIP.y, FRONT_Z]}
      >
        <meshStandardMaterial color={strip} metalness={0.04} roughness={0.66} />
      </RoundedBox>
    </group>
  );
}
