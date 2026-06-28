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

// The speaker grille: an octagon OUTLINE of holes. Each of the 4 cardinal edges
// (top/bottom/left/right) carries 5 holes; each of the 4 diagonal edges carries
// 4 holes (endpoints shared with neighbours, counted once). Flush on the body
// surface - the holes are dark recesses, their octagonal ring IS the grille.
export function Speaker({ x, y, z, r, power }: SpeakerProps) {
  const dots = useMemo(() => {
    // 8 octagon vertices (flat-top: first vertex at 22.5 degrees).
    const V: [number, number][] = [];
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      V.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const seen = new Set<string>();
    const pts: [number, number][] = [];
    const add = (px: number, py: number) => {
      const key = `${px.toFixed(3)},${py.toFixed(3)}`;
      if (seen.has(key)) return;
      seen.add(key);
      pts.push([px, py]);
    };
    // edge k connects V[k] -> V[k+1]; its midpoint angle is 45*(k+1) degrees, so
    // edges 1,3,5,7 are cardinal (5 holes) and 0,2,4,6 are diagonal (4 holes).
    for (let k = 0; k < 8; k++) {
      const [ax, ay] = V[k];
      const [bx, by] = V[(k + 1) % 8];
      const count = k % 2 === 1 ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        add(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
    return pts;
  }, [r]);

  const holeColor = powerColor(PALETTE.speakerDot, power);

  return (
    <group position={[x, y, z]}>
      <Instances limit={dots.length} range={dots.length}>
        <circleGeometry args={[0.032, 16]} />
        <meshStandardMaterial color={holeColor} metalness={0.15} roughness={0.7} />
        {dots.map((d, i) => (
          <Instance key={i} position={[d[0], d[1], 0.012]} />
        ))}
      </Instances>
    </group>
  );
}
