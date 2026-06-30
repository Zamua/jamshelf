import { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';

interface SpeakerProps {
  x: number;
  y: number;
  z: number;
  r: number;
  hole: string; // dark hole color (already power-adjusted)
}

// Regular flat-top octagon membership: intersection of an axis-aligned square
// (half-size = apothem) and a 45-degree-rotated square.
function inOctagon(px: number, py: number, apothem: number): boolean {
  return (
    Math.abs(px) <= apothem + 1e-6 &&
    Math.abs(py) <= apothem + 1e-6 &&
    Math.abs(px) + Math.abs(py) <= apothem * Math.SQRT2 + 1e-6
  );
}

// The speaker grille: a FILLED octagon field of round holes. The grid step is
// chosen so the flat top/bottom edge carries 5 holes (and the diagonals ~4),
// while the interior is filled in. Flush on the body surface; the holes are dark
// recesses, the octagon their overall shape.
export function Speaker({ x, y, z, r, hole }: SpeakerProps) {
  const dots = useMemo(() => {
    const apothem = r * Math.cos(Math.PI / 8); // center -> flat edge
    const edge = 2 * r * Math.sin(Math.PI / 8); // flat edge length
    const step = edge / 4; // 5 holes across the flat edge
    const pts: [number, number][] = [];
    const n = Math.ceil(apothem / step);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const px = i * step;
        const py = j * step;
        if (inOctagon(px, py, apothem)) pts.push([px, py]);
      }
    }
    return pts;
  }, [r]);

  return (
    <group position={[x, y, z]}>
      <Instances limit={dots.length} range={dots.length}>
        <circleGeometry args={[0.028, 14]} />
        <meshStandardMaterial color={hole} metalness={0.15} roughness={0.7} />
        {dots.map((d, i) => (
          <Instance key={i} position={[d[0], d[1], 0.012]} />
        ))}
      </Instances>
    </group>
  );
}
