import { RoundedBox } from '@react-three/drei';
import { BODY, FRONT_Z, KEY_WELL } from './layout';
import { PALETTE, powerColor } from './palette';

// The body of the device: a rounded-bevel anodized-blue slab. The pads sit as
// proud cream keycaps in a SHALLOW recessed panel (a slightly darker, slightly
// sunken blue area), matching the real device. No chunky raised rim and nothing
// extends past the slab edge.
export function Chassis({ power }: { power: boolean }) {
  const body = powerColor(PALETTE.bodyBlue, power);
  const deep = powerColor(PALETTE.bodyDeep, power);

  return (
    <group>
      {/* outer slab: body + sides + back + the top edge that holds the ports */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={0.22} smoothness={7}>
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </RoundedBox>

      {/* shallow recessed pad tray: a slightly darker blue panel, set just below
          the slab face, so the cream keycaps read as sitting in a sunken area. */}
      <RoundedBox
        args={[KEY_WELL.w, KEY_WELL.h, 0.12]}
        radius={0.09}
        smoothness={5}
        position={[KEY_WELL.x, KEY_WELL.y, FRONT_Z - 0.03]}
      >
        <meshStandardMaterial color={deep} metalness={0.42} roughness={0.36} />
      </RoundedBox>

      {/* thin deep-blue accent strip just inside the bottom edge (visual detail) */}
      <mesh position={[0, -BODY.h / 2 + 0.12, FRONT_Z + 0.006]}>
        <planeGeometry args={[BODY.w - 0.6, 0.04]} />
        <meshStandardMaterial color={deep} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}
