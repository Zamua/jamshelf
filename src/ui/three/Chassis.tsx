import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { BODY, BODY_RADIUS, COLS, FLOOR_Z, KEY_W, KEY_WELL, SCREEN, WELL_DEPTH } from './layout';
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

// The body: a steep-edged anodized slab with recesses cut into the face: ONE key
// well (the 7 keycaps rise from its floor) plus 4 snug square pockets across the
// top (the OLED + the 3 inset menu buttons). All are real cut geometry (extruded
// face with holes) so the inner walls catch light and read as truly sunken; a
// darker floor sits at the bottom of the key well.
export function Chassis({ power, theme }: { power: boolean; theme: BodyTheme }) {
  const body = powerColor(theme.body, power);
  const floor = powerColor(theme.floor, power);

  const landGeo = useMemo(() => {
    const shape = new THREE.Shape();
    roundRect(shape, 0, 0, BODY.w, BODY.h, BODY_RADIUS);

    // key well
    const kw = new THREE.Path();
    roundRect(kw, KEY_WELL.x, KEY_WELL.y, KEY_WELL.w, KEY_WELL.h, 0.12);
    shape.holes.push(kw);

    // 4 top-strip pockets: OLED (col 0) + the 3 menu buttons (cols 1..3)
    for (const cx of COLS) {
      const pocket = new THREE.Path();
      roundRect(pocket, cx, SCREEN.y, KEY_W, KEY_W, 0.06);
      shape.holes.push(pocket);
    }

    return new THREE.ExtrudeGeometry(shape, { depth: WELL_DEPTH, bevelEnabled: false });
  }, []);

  return (
    <group>
      {/* full slab behind: sides, back, top edge (the ports). Front face at the
          recess floor so it never covers a recess opening. */}
      <RoundedBox
        args={[BODY.w, BODY.h, BODY.d]}
        radius={BODY_RADIUS}
        smoothness={6}
        position={[0, 0, FLOOR_Z - BODY.d / 2]}
      >
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </RoundedBox>

      {/* raised land (face) with the well + pockets cut out */}
      <mesh geometry={landGeo} position={[0, 0, FLOOR_Z]}>
        <meshStandardMaterial color={body} metalness={0.4} roughness={0.35} />
      </mesh>

      {/* darker floor at the bottom of the key well */}
      <mesh position={[KEY_WELL.x, KEY_WELL.y, FLOOR_Z + 0.004]}>
        <planeGeometry args={[KEY_WELL.w - 0.02, KEY_WELL.h - 0.02]} />
        <meshStandardMaterial color={floor} metalness={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
}
