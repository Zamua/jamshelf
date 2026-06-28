import { useRef, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { FRONT_Z } from './layout';
import { dim } from './palette';

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

// Small extruded glyphs (no emoji): a key, a waveform, a clock. mat() returns a
// fresh material element per mesh (do not share one element instance).
function Icon({ icon, color }: { icon: MenuIcon; color: string }) {
  const mat = () => <meshStandardMaterial color={color} metalness={0.2} roughness={0.5} />;
  if (icon === 'key') {
    return (
      <group>
        <mesh position={[-0.07, 0, 0]}>
          <torusGeometry args={[0.05, 0.018, 10, 18]} />
          {mat()}
        </mesh>
        <mesh position={[0.03, 0, 0]}>
          <boxGeometry args={[0.14, 0.028, 0.03]} />
          {mat()}
        </mesh>
        <mesh position={[0.1, -0.035, 0]}>
          <boxGeometry args={[0.028, 0.04, 0.03]} />
          {mat()}
        </mesh>
      </group>
    );
  }
  if (icon === 'wave') {
    const heights = [0.05, 0.1, 0.17, 0.1, 0.05];
    return (
      <group>
        {heights.map((h, i) => (
          <mesh key={i} position={[(i - 2) * 0.055, 0, 0]}>
            <boxGeometry args={[0.026, h, 0.03]} />
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
        <torusGeometry args={[0.085, 0.016, 10, 22]} />
        {mat()}
      </mesh>
      <mesh position={[0, 0.022, 0.01]}>
        <boxGeometry args={[0.014, 0.062, 0.02]} />
        {mat()}
      </mesh>
      <mesh position={[0.022, 0, 0.01]} rotation={[0, 0, -Math.PI / 2.6]}>
        <boxGeometry args={[0.013, 0.05, 0.02]} />
        {mat()}
      </mesh>
    </group>
  );
}

// A colored rounded-cube menu button. Depresses on press and fires its handler.
export function MenuButton({ x, y, size, color, icon, power, onPress, resume }: MenuButtonProps) {
  const pressGroup = useRef<THREE.Group>(null);
  const [pressed, setPressed] = useState(false);

  useFrame((_, delta) => {
    if (!pressGroup.current) return;
    const targetZ = pressed ? -0.06 : 0;
    pressGroup.current.position.z +=
      (targetZ - pressGroup.current.position.z) * Math.min(1, delta * 22);
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
  const iconColor = power ? '#ffffff' : dim('#ffffff', 0.4);

  return (
    <group position={[x, y, FRONT_Z]}>
      {/* handlers on the wrapping group so the proud icon glyph is grabbable too */}
      <group
        ref={pressGroup}
        onPointerDown={down}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
      >
        <RoundedBox args={[size, size, 0.28]} radius={0.1} smoothness={4} position={[0, 0, 0.12]}>
          <meshStandardMaterial color={bodyColor} metalness={0.22} roughness={0.45} />
        </RoundedBox>
        {/* glyph scales with the button so it stays proportionate on big buttons */}
        <group position={[0, 0, 0.27]} scale={size / 0.44}>
          <Icon icon={icon} color={iconColor} />
        </group>
      </group>
    </group>
  );
}
