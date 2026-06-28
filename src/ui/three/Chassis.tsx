import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { BODY, BODY_RADIUS, FLOOR_Z, KEY_WELL, WELL_DEPTH } from './layout';
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

// The body: a steep-edged anodized slab with ONE recess cut into the face - the
// key well, holding the OLED + 3 menu buttons + 7 keys (they all rise flush from
// its floor). It is real cut geometry (extruded face with a hole) so the inner
// walls catch light and read as truly sunken; a darker floor sits at the bottom.
export function Chassis({ power, theme }: { power: boolean; theme: BodyTheme }) {
  const body = powerColor(theme.body, power);
  const floor = powerColor(theme.floor, power);

  const landGeo = useMemo(() => {
    const shape = new THREE.Shape();
    roundRect(shape, 0, 0, BODY.w, BODY.h, BODY_RADIUS);

    // the one key well
    const kw = new THREE.Path();
    roundRect(kw, KEY_WELL.x, KEY_WELL.y, KEY_WELL.w, KEY_WELL.h, 0.13);
    shape.holes.push(kw);

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
        <meshStandardMaterial color={body} metalness={0.5} roughness={0.24} />
      </RoundedBox>

      {/* raised land (face) with the well + pockets cut out */}
      <mesh geometry={landGeo} position={[0, 0, FLOOR_Z]}>
        <meshStandardMaterial color={body} metalness={0.5} roughness={0.24} />
      </mesh>

      {/* darker floor at the bottom of the key well */}
      <mesh position={[KEY_WELL.x, KEY_WELL.y, FLOOR_Z + 0.004]}>
        <planeGeometry args={[KEY_WELL.w - 0.02, KEY_WELL.h - 0.02]} />
        <meshStandardMaterial color={floor} metalness={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
}
