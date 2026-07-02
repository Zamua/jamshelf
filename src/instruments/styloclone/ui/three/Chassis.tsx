import { RoundedBox } from '@react-three/drei';
import { BODY, BODY_RADIUS, FRONT_Z, PLATE } from './layout';
import { PALETTE, dim } from './palette';

// The cream ABS slab + the raised brushed-silver keyboard plate. Purely structural; the keys,
// controls, speaker, wordmark and stylus are layered on top by the Device.
export function Chassis({ power }: { power: boolean }) {
  const body = power ? PALETTE.body : dim(PALETTE.body, 0.35);
  const plate = power ? PALETTE.plate : dim(PALETTE.plate, 0.35);

  return (
    <group>
      {/* the cream body slab */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={BODY_RADIUS} smoothness={5}>
        <meshStandardMaterial color={body} metalness={0.08} roughness={0.62} />
      </RoundedBox>

      {/* raised silver keyboard plate on the lower face */}
      <RoundedBox
        args={[PLATE.w, PLATE.h, PLATE.raise * 2]}
        radius={PLATE.radius}
        smoothness={4}
        position={[PLATE.x, PLATE.y, FRONT_Z]}
      >
        <meshStandardMaterial color={plate} metalness={0.72} roughness={0.34} />
      </RoundedBox>
    </group>
  );
}
