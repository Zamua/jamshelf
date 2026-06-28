import { useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { FRONT_Z, WELL_DEPTH } from './layout';
import { dim, isLightBody } from './palette';

export type MenuIcon = 'key' | 'wave' | 'clock';

interface MenuButtonProps {
  x: number;
  y: number;
  size: number;
  color: string;
  icon: MenuIcon;
  power: boolean;
  onPress(): void;
  resume(): void;
}

// A centered rounded-square outline (for the tile frame).
function roundSquare(p: THREE.Shape, side: number, r: number) {
  const h = side / 2;
  p.moveTo(-h + r, -h);
  p.lineTo(h - r, -h);
  p.quadraticCurveTo(h, -h, h, -h + r);
  p.lineTo(h, h - r);
  p.quadraticCurveTo(h, h, h - r, h);
  p.lineTo(-h + r, h);
  p.quadraticCurveTo(-h, h, -h, h - r);
  p.lineTo(-h, -h + r);
  p.quadraticCurveTo(-h, -h, -h + r, -h);
}

// A concave spherical-cap bowl (revolved profile). rim radius `a`, depth `d`.
// Profile runs from the center apex (0,-d) out to the rim (a,0) along a circular
// arc, so the revolved surface is a gentle dish (near-flat at center). Returned
// with the bowl opening toward +z once the mesh is rotated +90deg about X.
function buildBowl(a: number, d: number): THREE.LatheGeometry {
  const R = (a * a + d * d) / (2 * d); // sphere radius of the cap
  const phiMax = Math.asin(Math.min(1, a / R));
  const N = 28;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const phi = (i / N) * phiMax;
    pts.push(new THREE.Vector2(R * Math.sin(phi), R - d - R * Math.cos(phi)));
  }
  const g = new THREE.LatheGeometry(pts, 48);
  g.computeVertexNormals();
  return g;
}

// Flat "painted-on" icon: thin coplanar shapes (rings + bars), NOT extruded 3D
// objects floating above. Lies on the dish floor so it reads as printed.
function Icon({ icon, color }: { icon: MenuIcon; color: string }) {
  const mat = () => <meshStandardMaterial color={color} metalness={0.1} roughness={0.5} />;
  if (icon === 'key') {
    return (
      <group>
        <mesh position={[-0.075, 0, 0]}>
          <ringGeometry args={[0.03, 0.058, 24]} />
          {mat()}
        </mesh>
        <mesh position={[0.035, 0, 0]}>
          <planeGeometry args={[0.16, 0.024]} />
          {mat()}
        </mesh>
        <mesh position={[0.095, -0.028, 0]}>
          <planeGeometry args={[0.024, 0.034]} />
          {mat()}
        </mesh>
        <mesh position={[0.125, -0.022, 0]}>
          <planeGeometry args={[0.02, 0.026]} />
          {mat()}
        </mesh>
      </group>
    );
  }
  if (icon === 'wave') {
    const heights = [0.06, 0.11, 0.18, 0.11, 0.06];
    return (
      <group>
        {heights.map((h, i) => (
          <mesh key={i} position={[(i - 2) * 0.052, 0, 0]}>
            <planeGeometry args={[0.024, h]} />
            {mat()}
          </mesh>
        ))}
      </group>
    );
  }
  // clock
  return (
    <group>
      <mesh>
        <ringGeometry args={[0.072, 0.094, 28]} />
        {mat()}
      </mesh>
      <mesh position={[0, 0.024, 0]}>
        <planeGeometry args={[0.016, 0.058]} />
        {mat()}
      </mesh>
      <mesh position={[0.022, 0, 0]} rotation={[0, 0, -Math.PI / 2.6]}>
        <planeGeometry args={[0.014, 0.048]} />
        {mat()}
      </mesh>
    </group>
  );
}

// An INSET colored menu button. The case has a square pocket cut for it (Chassis).
// The button is a flat rounded-square tile whose top sits BELOW the case face (so
// it does not protrude - only the joystick does), with a wide concave finger dish
// scooped into it and a flat painted icon on the dish. The tile FACE is an
// extruded frame with a CIRCULAR HOLE so the dish below it is not occluded (the
// same recess trick the key well uses).
export function MenuButton({ x, y, size, color, icon, power, onPress, resume }: MenuButtonProps) {
  const pressGroup = useRef<THREE.Group>(null);
  const [pressed, setPressed] = useState(false);

  useFrame((_, delta) => {
    if (!pressGroup.current) return;
    const targetZ = pressed ? -0.025 : 0;
    pressGroup.current.position.z += (targetZ - pressGroup.current.position.z) * Math.min(1, delta * 22);
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    onPress();
    setPressed(true);
  };
  const release = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setPressed(false);
  };

  const bodyColor = power ? color : dim(color);
  // Dark glyph on the light buttons (gray, yellow), white on the saturated red -
  // matches the real device.
  const inkColor = isLightBody(color) ? '#2b2d31' : '#f4f5f7';
  const iconColor = power ? inkColor : dim(inkColor, 0.4);

  // Geometry, in the group's local z (group sits at FRONT_Z = the case face, z=0).
  const tile = size - 0.035; // leaves a sliver of case wall framing the tile
  const topZ = -0.045; // tile face, set below the case face -> inset, not proud
  const floorZ = -WELL_DEPTH; // pocket floor
  const dishR = tile * 0.42; // wide finger dish
  const dishDepth = 0.05;
  const dishFloorZ = topZ - dishDepth;

  // Tile face: rounded-square frame with a circular hole, extruded to the floor.
  const tileGeo = useMemo(() => {
    const s = new THREE.Shape();
    roundSquare(s, tile, 0.03);
    const hole = new THREE.Path();
    hole.absarc(0, 0, dishR, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: topZ - floorZ, bevelEnabled: false });
  }, [tile, dishR, topZ, floorZ]);

  const bowlGeo = useMemo(() => buildBowl(dishR, dishDepth), [dishR, dishDepth]);

  return (
    <group position={[x, y, FRONT_Z]}>
      <group
        ref={pressGroup}
        onPointerDown={down}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
      >
        {/* tile frame (front face at topZ, extruded back to the pocket floor) */}
        <mesh geometry={tileGeo} position={[0, 0, floorZ]}>
          <meshStandardMaterial color={bodyColor} metalness={0.12} roughness={0.5} />
        </mesh>

        {/* concave finger dish filling the hole; rim at topZ, dips to dishFloorZ */}
        <mesh geometry={bowlGeo} position={[0, 0, topZ]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial
            color={bodyColor}
            metalness={0.1}
            roughness={0.62}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* flat painted icon resting on the dish */}
        <group position={[0, 0, dishFloorZ + 0.008]} scale={tile / 0.6}>
          <Icon icon={icon} color={iconColor} />
        </group>
      </group>
    </group>
  );
}
