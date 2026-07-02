import { BODY, FRONT_Z, STYLUS } from './layout';
import { PALETTE } from './palette';

// The tethered stylus: a slim pen resting diagonally over the keyboard, on a thin cord running off
// to the top edge. Decorative (you play with a finger/mouse on the keys); it sells the look.
export function Stylus() {
  const { tipX, tipY, len, angle, r } = STYLUS;
  const cx = tipX - Math.cos(angle) * (len / 2);
  const cy = tipY - Math.sin(angle) * (len / 2);
  // the far (butt) end, where the cord attaches
  const bx = tipX - Math.cos(angle) * len;
  const by = tipY - Math.sin(angle) * len;
  // the cord runs from the butt up to an anchor near the top edge
  const ax = bx + 0.5;
  const ay = BODY.h / 2 - 0.15;
  const cordLen = Math.hypot(ax - bx, ay - by);
  const cordAngle = Math.atan2(ay - by, ax - bx);

  return (
    <group>
      {/* the pen barrel */}
      <group position={[cx, cy, FRONT_Z + 0.16]} rotation={[0, 0, angle]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r, r * 0.7, len, 16]} />
          <meshStandardMaterial color={PALETTE.stylus} metalness={0.5} roughness={0.4} />
        </mesh>
        {/* metal tip */}
        <mesh position={[len / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[r * 0.9, r * 2.2, 16]} />
          <meshStandardMaterial color={PALETTE.plate} metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
      {/* the cord: a thin cylinder from the pen butt up to the top-edge anchor */}
      <group position={[(bx + ax) / 2, (by + ay) / 2, FRONT_Z + 0.05]} rotation={[0, 0, cordAngle]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, cordLen, 8]} />
          <meshStandardMaterial color={PALETTE.cord} metalness={0.1} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}
