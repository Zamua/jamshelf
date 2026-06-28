import { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE, powerColor } from './palette';

interface SpeakerProps {
  x: number;
  y: number;
  z: number;
  r: number;
  power: boolean;
}

// Trace a flat-top regular octagon (circumradius rr) onto a Shape or Path.
function traceOctagon(path: THREE.Shape | THREE.Path, rr: number) {
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    const vx = rr * Math.cos(a);
    const vy = rr * Math.sin(a);
    if (k === 0) path.moveTo(vx, vy);
    else path.lineTo(vx, vy);
  }
  path.closePath();
}

// Regular flat-top octagon membership: intersection of an axis-aligned square
// (half-size = apothem) and a 45-degree-rotated square.
function inOctagon(px: number, py: number, apothem: number): boolean {
  return (
    Math.abs(px) <= apothem &&
    Math.abs(py) <= apothem &&
    Math.abs(px) + Math.abs(py) <= apothem * Math.SQRT2
  );
}

// The octagon speaker: a raised octagonal ring over a recessed dark panel with
// an instanced dot-matrix grille clipped to the octagon. The grille is the real
// shape (the dots form the octagon outline, not a painted-on texture).
export function Speaker({ x, y, z, r, power }: SpeakerProps) {
  // Raised ring (outer octagon with an inner octagon hole).
  const ring = useMemo(() => {
    const s = new THREE.Shape();
    traceOctagon(s, r);
    const hole = new THREE.Path();
    traceOctagon(hole, r * 0.84);
    s.holes.push(hole);
    return s;
  }, [r]);

  // Recessed panel just inside the ring.
  const panel = useMemo(() => {
    const s = new THREE.Shape();
    traceOctagon(s, r * 0.86);
    return s;
  }, [r]);

  // Dot grid clipped to a slightly smaller octagon.
  const dots = useMemo(() => {
    const apothem = r * 0.78 * Math.cos(Math.PI / 8);
    const step = 0.08;
    const pts: [number, number][] = [];
    for (let gx = -apothem; gx <= apothem + 1e-6; gx += step) {
      for (let gy = -apothem; gy <= apothem + 1e-6; gy += step) {
        if (inOctagon(gx, gy, apothem)) pts.push([gx, gy]);
      }
    }
    return pts;
  }, [r]);

  const dotColor = powerColor(PALETTE.speakerDot, power);

  return (
    <group position={[x, y, z]}>
      {/* recessed dark panel (the basin) */}
      <mesh position={[0, 0, 0.02]}>
        <shapeGeometry args={[panel]} />
        <meshStandardMaterial color="#06103a" metalness={0.2} roughness={0.7} />
      </mesh>

      {/* dot-matrix grille */}
      <Instances limit={dots.length} range={dots.length}>
        <circleGeometry args={[0.023, 10]} />
        <meshStandardMaterial color={dotColor} metalness={0.1} roughness={0.6} />
        {dots.map((d, i) => (
          <Instance key={i} position={[d[0], d[1], 0.03]} />
        ))}
      </Instances>

      {/* raised octagon ring (proud, so the panel reads as recessed inside it) */}
      <mesh position={[0, 0, 0.1]}>
        <shapeGeometry args={[ring]} />
        <meshStandardMaterial color={powerColor(PALETTE.bodyBlue, power)} metalness={0.42} roughness={0.34} />
      </mesh>
    </group>
  );
}
