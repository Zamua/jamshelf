import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { BODY, BODY_RADIUS, FRONT_Z, WELL } from './layout';
import { PALETTE, powerColor } from './palette';

// Append a rounded-rectangle outline (centered at cx,cy) to a Shape or Path.
function roundRect(p: THREE.Shape | THREE.Path, cx: number, cy: number, w: number, h: number, r: number) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
}

const WELL_DEPTH = 0.12; // how deep the recessed panel is sunk below the face
const FLOOR_Z = FRONT_Z - WELL_DEPTH;

// The body of the device: a steep-edged anodized-blue slab with ONE large
// recessed well cut into the right ~2/3 of the face. The screen, the 3 menu
// buttons and the 7 cream keycaps all sit DOWN INSIDE that single well (the real
// device's defining feature). The speaker + mic + joystick sit on the raised
// blue land to the left of the well.
//
// The recess is real geometry, not a painted-on rectangle: the front face is an
// extruded rounded-rect with a rounded-rect HOLE at the well, so the hole's
// inner walls catch the scene lighting and read as a true sunken panel. A darker
// floor plane sits at the bottom of the well; a full blue slab behind provides
// the sides, back and top edge.
export function Chassis({ power }: { power: boolean }) {
  const body = powerColor(PALETTE.bodyBlue, power);
  const floor = powerColor(PALETTE.wellFloor, power);

  // The raised blue land: body silhouette with the well punched out, extruded
  // forward by WELL_DEPTH so the hole becomes a recess with real walls.
  const landGeo = useMemo(() => {
    const shape = new THREE.Shape();
    roundRect(shape, 0, 0, BODY.w, BODY.h, BODY_RADIUS);
    const hole = new THREE.Path();
    roundRect(hole, WELL.x, WELL.y, WELL.w, WELL.h, 0.12);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, {
      depth: WELL_DEPTH,
      bevelEnabled: false,
    });
  }, []);

  return (
    <group>
      {/* full blue slab behind: provides sides, back, and the top edge that
          carries the ports (visible when orbiting). Its front face sits at the
          well floor so it never covers the recess opening. */}
      <RoundedBox
        args={[BODY.w, BODY.h, BODY.d]}
        radius={BODY_RADIUS}
        smoothness={6}
        position={[0, 0, FLOOR_Z - BODY.d / 2]}
      >
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </RoundedBox>

      {/* raised blue land (face) with the well cut out: extrudes FLOOR_Z -> FRONT_Z */}
      <mesh geometry={landGeo} position={[0, 0, FLOOR_Z]}>
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </mesh>

      {/* darker well floor at the bottom of the recess */}
      <mesh position={[WELL.x, WELL.y, FLOOR_Z + 0.004]}>
        <planeGeometry args={[WELL.w - 0.02, WELL.h - 0.02]} />
        <meshStandardMaterial color={floor} metalness={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
}
