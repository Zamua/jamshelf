import { FRONT_Z } from './layout';
import { PALETTE, dim } from './palette';

// A round speaker grille: a shallow recessed disc with a hole-dot field, on the cream land.
export function Speaker({ x, y, r, power }: { x: number; y: number; r: number; power: boolean }) {
  const ring = power ? PALETTE.bodyShadow : dim(PALETTE.bodyShadow, 0.3);
  const hole = PALETTE.gap;

  // concentric rings of holes filling the disc
  const dots: [number, number][] = [];
  const rings = 5;
  for (let ri = 1; ri <= rings; ri++) {
    const rr = (ri / rings) * r * 0.82;
    const count = Math.max(6, Math.round(ri * 6));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ri * 0.3;
      dots.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
  }

  return (
    <group position={[x, y, FRONT_Z + 0.006]}>
      {/* recessed ring */}
      <mesh position={[0, 0, -0.02]}>
        <ringGeometry args={[r * 0.9, r, 40]} />
        <meshStandardMaterial color={ring} metalness={0.15} roughness={0.7} />
      </mesh>
      {dots.map(([dx, dy], i) => (
        <mesh key={i} position={[dx, dy, 0]}>
          <circleGeometry args={[r * 0.05, 10]} />
          <meshStandardMaterial color={hole} metalness={0.2} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
