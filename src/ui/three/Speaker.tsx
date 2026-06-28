import { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import { PALETTE, powerColor } from './palette';

interface SpeakerProps {
  x: number;
  y: number;
  z: number;
  r: number;
  power: boolean;
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

// The speaker grille: just an octagonal field of round holes, FLUSH on the body
// surface (no recessed basin, no raised ring). The dots are dark holes; their
// octagonal arrangement IS the grille shape, matching the real device.
export function Speaker({ x, y, z, r, power }: SpeakerProps) {
  const dots = useMemo(() => {
    // apothem of the octagon the holes fill (a touch inside r).
    const apothem = r * Math.cos(Math.PI / 8);
    const step = 0.094;
    const pts: [number, number][] = [];
    for (let gx = -apothem; gx <= apothem + 1e-6; gx += step) {
      for (let gy = -apothem; gy <= apothem + 1e-6; gy += step) {
        if (inOctagon(gx, gy, apothem)) pts.push([gx, gy]);
      }
    }
    return pts;
  }, [r]);

  // Holes read as dark recesses in the blue body (slightly darker when off).
  const holeColor = powerColor(PALETTE.speakerDot, power);

  return (
    <group position={[x, y, z]}>
      <Instances limit={dots.length} range={dots.length}>
        <circleGeometry args={[0.034, 14]} />
        <meshStandardMaterial color={holeColor} metalness={0.15} roughness={0.7} />
        {dots.map((d, i) => (
          <Instance key={i} position={[d[0], d[1], 0.012]} />
        ))}
      </Instances>
    </group>
  );
}
