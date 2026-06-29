import { useRef, useState, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { DeviceHandlers } from './deviceProps';
import { PALETTE, powerColor } from './palette';

interface KnobProps {
  x: number;
  y: number;
  z: number;
  power: boolean;
  rim: string; // theme deep shade (dish rim)
  basin: string; // theme darkest shade (dish basin)
  handlers: DeviceHandlers;
  // Shared "which pointer owns the joystick" ref. Knob sets it on grab / clears it
  // on release; the pads READ it and ignore that pointer, so a finger that started
  // on the joystick can never press a key even if it drags over the key area.
  joyPointer: RefObject<number | null>;
}

const RADIUS = 0.36; // normalization radius: dragging this far == full deflection
const TRAVEL = 0.1; // how far the cap visually shifts at full deflection
const TILT = 0.45; // how far the cap tilts (radians) at full deflection

// The joystick: a cream cap in a recessed dish. Dragging emits a normalized
// vector (x = right+, y = up+, clamped to the unit circle) via onJoyMove;
// releasing springs the cap back to center and fires onJoyEnd. While dragging,
// a large invisible plane in front of the device tracks the pointer so the drag
// keeps following even when it slides off the small cap.
export function Knob({ x, y, z, power, rim, basin, handlers, joyPointer }: KnobProps) {
  const group = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector2(0, 0));
  const cur = useRef(new THREE.Vector2(0, 0));
  const [dragging, setDragging] = useState(false);
  // The drag-tracking plane covers the whole stage, so we IGNORE events from any
  // other finger - otherwise a second finger pressing a pad would drive (or end)
  // the joystick AND, because the plane sits in front, swallow that pad's release
  // (stuck key). Foreign pointers fall through (no stopPropagation) so the pad
  // behind still gets them. `joyPointer` is shared with the pads (see KnobProps).
  const owns = (e: ThreeEvent<PointerEvent>) =>
    joyPointer.current === null || e.pointerId === joyPointer.current;

  const apply = (e: ThreeEvent<PointerEvent>) => {
    if (!group.current || !owns(e)) return;
    // Convert the world hit point into the knob's local frame (this divides out
    // the device's responsive scale + any inspect rotation), then normalize.
    const local = group.current.worldToLocal(e.point.clone());
    let nx = local.x / RADIUS;
    let ny = local.y / RADIUS;
    const m = Math.hypot(nx, ny);
    if (m > 1) {
      nx /= m;
      ny /= m;
    }
    target.current.set(nx, ny);
    handlers.onJoyMove(nx, ny);
  };

  const start = (e: ThreeEvent<PointerEvent>) => {
    if (joyPointer.current !== null) return; // a drag is already in progress
    e.stopPropagation();
    joyPointer.current = e.pointerId;
    handlers.resume();
    setDragging(true);
    apply(e);
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!owns(e)) return; // a different finger - let it pass through to the pad
    e.stopPropagation();
    joyPointer.current = null;
    setDragging(false);
    target.current.set(0, 0);
    handlers.onJoyEnd();
  };

  useFrame((_, delta) => {
    cur.current.lerp(target.current, Math.min(1, delta * 14));
    if (pivot.current) {
      pivot.current.position.x = cur.current.x * TRAVEL;
      pivot.current.position.y = cur.current.y * TRAVEL;
      pivot.current.rotation.x = -cur.current.y * TILT;
      pivot.current.rotation.y = cur.current.x * TILT;
    }
  });

  const creamCap = powerColor(PALETTE.cream, power);
  const creamHi = powerColor(PALETTE.creamHi, power);
  const creamShadow = powerColor(PALETTE.creamShadow, power);

  return (
    <group ref={group} position={[x, y, z]}>
      {/* shallow dark dish basin (the cap sits slightly down inside it) */}
      <mesh position={[0, 0, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[RADIUS, RADIUS * 0.96, 0.07, 44]} />
        <meshStandardMaterial color={powerColor(basin, power)} metalness={0.3} roughness={0.55} />
      </mesh>
      {/* thin rim around the dish */}
      <mesh position={[0, 0, 0.06]}>
        <torusGeometry args={[RADIUS * 0.97, 0.032, 14, 44]} />
        <meshStandardMaterial color={powerColor(rim, power)} metalness={0.45} roughness={0.4} />
      </mesh>

      {/* tiltable cap rising out of the dish. Handlers live on the pivot group so
          the whole cap face (including the proud thumb-dish circles) is grabbable. */}
      <group ref={pivot} position={[0, 0, 0.15]} onPointerDown={start} onPointerUp={end} onPointerCancel={end}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.23, 0.25, 0.11, 36]} />
          <meshStandardMaterial color={creamCap} metalness={0.08} roughness={0.4} />
        </mesh>
        {/* concave thumb dish on the cap face */}
        <mesh position={[0, 0, 0.06]}>
          <circleGeometry args={[0.13, 28]} />
          <meshStandardMaterial color={creamHi} metalness={0.08} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.063]}>
          <circleGeometry args={[0.042, 20]} />
          <meshStandardMaterial color={creamShadow} metalness={0.05} roughness={0.5} />
        </mesh>
      </group>

      {/* invisible drag-tracking plane (only while dragging) */}
      {dragging && (
        <mesh position={[0, 0, 1.5]} onPointerMove={apply} onPointerUp={end} onPointerCancel={end}>
          <planeGeometry args={[24, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
