import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { BODY, BODY_RADIUS, FLOOR_Z, SCREEN, WELL, WELL_DEPTH } from './layout';
import { powerColor, type BodyTheme } from './palette';

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

// The body: a steep-edged anodized-blue slab. Two recesses are CUT into the
// face: (1) a single large L-shaped well holding the 3 menu buttons + 7 keys,
// and (2) a small square pocket for the OLED, top-left. The well is notched
// (sculpted) around the screen pocket so they read as two separate recesses
// joined by a thin blue divider. Recesses are real geometry (extruded face with
// holes) so the inner walls catch light and read as truly sunken.
export function Chassis({ power, theme }: { power: boolean; theme: BodyTheme }) {
  const body = powerColor(theme.body, power);
  const floor = powerColor(theme.floor, power);

  const landGeo = useMemo(() => {
    const shape = new THREE.Shape();
    roundRect(shape, 0, 0, BODY.w, BODY.h, BODY_RADIUS);

    // L-shaped well: full well rect with the top-left corner notched out to make
    // room for the screen pocket (the well sculpts around the screen).
    const Lx = WELL.x - WELL.w / 2;
    const Rx = WELL.x + WELL.w / 2;
    const Ty = WELL.y + WELL.h / 2;
    const By = WELL.y - WELL.h / 2;
    const nRx = SCREEN.x + SCREEN.w / 2 + 0.03; // notch right edge (the column gap)
    const nBy = SCREEN.y - SCREEN.h / 2 - 0.03; // notch bottom edge (below screen)
    const well = new THREE.Path();
    well.moveTo(Lx, By);
    well.lineTo(Rx, By);
    well.lineTo(Rx, Ty);
    well.lineTo(nRx, Ty);
    well.lineTo(nRx, nBy);
    well.lineTo(Lx, nBy);
    well.closePath();
    shape.holes.push(well);

    // square screen pocket
    const screen = new THREE.Path();
    roundRect(screen, SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 0.05);
    shape.holes.push(screen);

    return new THREE.ExtrudeGeometry(shape, { depth: WELL_DEPTH, bevelEnabled: false });
  }, []);

  return (
    <group>
      {/* full blue slab behind: sides, back, top edge (the ports). Front face at
          the well floor so it never covers a recess opening. */}
      <RoundedBox
        args={[BODY.w, BODY.h, BODY.d]}
        radius={BODY_RADIUS}
        smoothness={6}
        position={[0, 0, FLOOR_Z - BODY.d / 2]}
      >
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </RoundedBox>

      {/* raised blue land (face) with the two recesses cut out */}
      <mesh geometry={landGeo} position={[0, 0, FLOOR_Z]}>
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </mesh>

      {/* darker floor at the bottom of the well recess (covered by the land where
          the notch/screen are, so navy only shows through the actual openings) */}
      <mesh position={[WELL.x, WELL.y, FLOOR_Z + 0.004]}>
        <planeGeometry args={[WELL.w - 0.02, WELL.h - 0.02]} />
        <meshStandardMaterial color={floor} metalness={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
}
