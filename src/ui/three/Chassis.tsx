import { RoundedBox } from '@react-three/drei';
import { BODY, FRONT_Z, KEY_WELL } from './layout';
import { PALETTE, powerColor } from './palette';

const HW = KEY_WELL.w / 2;
const HH = KEY_WELL.h / 2;
const LIP = 0.15; // raised rim thickness around the well

// The body of the device: a rounded-bevel anodized-blue slab. The recessed key
// well is faked without CSG by a dark, proud floor surrounded by a raised rim
// of body-colored bars: the rim sits higher than the floor, so the floor reads
// as the bottom of a sunken pocket (and nothing is hidden behind the slab face).
export function Chassis({ power }: { power: boolean }) {
  const body = powerColor(PALETTE.bodyBlue, power);
  const deep = powerColor(PALETTE.bodyDeep, power);
  const well = powerColor(PALETTE.keyWell, power);

  // Raised rim bar around the key well.
  const Rim = ({
    args,
    pos,
  }: {
    args: [number, number, number];
    pos: [number, number, number];
  }) => (
    <RoundedBox args={args} radius={0.05} smoothness={4} position={pos}>
      <meshStandardMaterial color={body} metalness={0.42} roughness={0.34} />
    </RoundedBox>
  );

  const rimFront = FRONT_Z + 0.11; // rim top
  const rimDepth = 0.34;
  const rimZ = rimFront - rimDepth / 2;

  return (
    <group>
      {/* outer slab: body + sides + back + the top edge that holds the ports */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={0.22} smoothness={7}>
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </RoundedBox>

      {/* thin deep-blue accent strip just inside the bottom edge (visual detail) */}
      <mesh position={[0, -BODY.h / 2 + 0.12, FRONT_Z + 0.006]}>
        <planeGeometry args={[BODY.w - 0.5, 0.05]} />
        <meshStandardMaterial color={deep} metalness={0.4} roughness={0.4} />
      </mesh>

      {/* dark recessed well floor (proud of the slab so it is visible) */}
      <RoundedBox
        args={[KEY_WELL.w, KEY_WELL.h, 0.3]}
        radius={0.1}
        smoothness={5}
        position={[KEY_WELL.x, KEY_WELL.y, FRONT_Z + 0.02 - 0.15]}
      >
        <meshStandardMaterial color={well} metalness={0.3} roughness={0.55} />
      </RoundedBox>

      {/* raised rim around the well (top, bottom, left, right) */}
      <Rim args={[KEY_WELL.w + 2 * LIP, LIP, rimDepth]} pos={[KEY_WELL.x, KEY_WELL.y + HH + LIP / 2, rimZ]} />
      <Rim args={[KEY_WELL.w + 2 * LIP, LIP, rimDepth]} pos={[KEY_WELL.x, KEY_WELL.y - HH - LIP / 2, rimZ]} />
      <Rim args={[LIP, KEY_WELL.h, rimDepth]} pos={[KEY_WELL.x - HW - LIP / 2, KEY_WELL.y, rimZ]} />
      <Rim args={[LIP, KEY_WELL.h, rimDepth]} pos={[KEY_WELL.x + HW + LIP / 2, KEY_WELL.y, rimZ]} />
    </group>
  );
}
