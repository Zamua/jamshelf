import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';
import { Text } from '@react-three/drei';
import { BRAND_FONT } from './brandFont';

// Rightward lean (oblique): x' = x + SLANT*y, so the top of each letter shifts right.
// tan(~14.6 deg). An oblique shear of the existing upright Poppins, rather than a separate
// italic font file, so there is no extra asset to bundle / fetch.
const SLANT = 0.26;

interface BrandProps {
  x: number;
  y: number;
  z: number;
  color: string;
  fontSize: number;
  text: string;
}

// The HiClone wordmark, slanted to the right. The shear lives on an inner group whose
// matrix is set manually (matrixAutoUpdate off); the outer group carries the position so
// the two concerns stay separate and the Text itself stays anchor-centered.
export function Brand({ x, y, z, color, fontSize, text }: BrandProps) {
  const shear = useRef<Group>(null);
  useLayoutEffect(() => {
    const g = shear.current;
    if (!g) return;
    g.matrixAutoUpdate = false;
    g.matrix.makeShear(0, 0, SLANT, 0, 0, 0); // element [0][1] = SLANT -> x sheared by y
  }, []);
  return (
    <group position={[x, y, z]}>
      <group ref={shear}>
        <Text
          font={BRAND_FONT}
          fontSize={fontSize}
          color={color}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.005}
        >
          {text}
        </Text>
      </group>
    </group>
  );
}
