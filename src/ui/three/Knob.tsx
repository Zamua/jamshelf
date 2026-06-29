import { useRef, useState, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { KNOB_WELL_R, WELL_DEPTH } from './layout';
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

const RADIUS = 0.34; // normalization radius: dragging this far == full deflection
const GRAB = 0.56; // radius of the (invisible) grab target around the cap
const TRAVEL = 0.1; // how far the cap visually shifts at full deflection
const TILT = 0.45; // how far the cap tilts (radians) at full deflection
const HOLD_MS = 550; // press longer than this (no drag) = a long-press, not a tap

// Local z levels (the group sits at FRONT_Z, so z=0 is the case face). The dish is
// RECESSED into a cut well (Chassis cuts the hole); only the cap protrudes.
const WELL_FLOOR = -WELL_DEPTH; // bottom of the joystick well
const CAP_Z = 0.02; // cap pivot: base sits in the recess, top protrudes

// The joystick: a cream cap protruding from a RECESSED dish. It is a FLOATING
// joystick - the point where the finger lands becomes the centre (origin), and
// deflection is measured RELATIVE to it, so a touch never instantly snaps to a
// direction; you have to actually drag. While dragging, a large invisible plane in
// front of the device tracks the pointer so the drag keeps following off the cap.
export function Knob({ x, y, z, power, rim, basin, handlers, joyPointer }: KnobProps) {
  const group = useRef<THREE.Group>(null);
  const pivot = useRef<THREE.Group>(null);
  const origin = useRef(new THREE.Vector2(0, 0)); // where the finger landed (the centre)
  const target = useRef(new THREE.Vector2(0, 0));
  const cur = useRef(new THREE.Vector2(0, 0));
  const [dragging, setDragging] = useState(false);
  // Tap vs hold detection (the joystick CLICK / long-press controls the looper): a
  // press that never drags is a TAP on release (-> onJoyClick), or a long HOLD if it
  // stays down past HOLD_MS without dragging (-> onJoyHold). Any real drag cancels both.
  const downAt = useRef(0);
  const moved = useRef(false);
  const holdFired = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoldTimer = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  // The drag-tracking plane covers the whole stage, so we IGNORE events from any
  // other finger - otherwise a second finger pressing a pad would drive (or end)
  // the joystick AND, because the plane sits in front, swallow that pad's release
  // (stuck key). Foreign pointers fall through (no stopPropagation) so the pad
  // behind still gets them. `joyPointer` is shared with the pads (see KnobProps).
  const owns = (e: ThreeEvent<PointerEvent>) =>
    joyPointer.current === null || e.pointerId === joyPointer.current;

  const apply = (e: ThreeEvent<PointerEvent>) => {
    if (!group.current || !owns(e)) return;
    // Local hit point (divides out the device's responsive scale + inspect rotation),
    // measured RELATIVE to where the finger first landed, then normalized.
    const local = group.current.worldToLocal(e.point.clone());
    let nx = (local.x - origin.current.x) / RADIUS;
    let ny = (local.y - origin.current.y) / RADIUS;
    const m = Math.hypot(nx, ny);
    if (m > 1) {
      nx /= m;
      ny /= m;
    }
    if (m > 0.15) {
      moved.current = true; // a real drag: not a tap/hold
      clearHoldTimer();
    }
    target.current.set(nx, ny);
    handlers.onJoyMove(nx, ny);
  };

  const start = (e: ThreeEvent<PointerEvent>) => {
    if (joyPointer.current !== null || !group.current) return; // a drag is in progress
    e.stopPropagation();
    joyPointer.current = e.pointerId;
    // The landing point is the centre: zero deflection until the finger moves.
    const local = group.current.worldToLocal(e.point.clone());
    origin.current.set(local.x, local.y);
    target.current.set(0, 0);
    downAt.current = performance.now();
    moved.current = false;
    holdFired.current = false;
    clearHoldTimer();
    holdTimer.current = setTimeout(() => {
      if (!moved.current) {
        holdFired.current = true;
        handlers.onJoyHold();
      }
    }, HOLD_MS);
    handlers.resume();
    setDragging(true);
    handlers.onJoyMove(0, 0);
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!owns(e)) return; // a different finger - let it pass through to the pad
    e.stopPropagation();
    joyPointer.current = null;
    setDragging(false);
    clearHoldTimer();
    // a quick press that never dragged and never became a hold = a click
    if (!moved.current && !holdFired.current && performance.now() - downAt.current < HOLD_MS) {
      handlers.onJoyClick();
    }
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
      {/* dark dish basin, recessed in the cut well (sized to the well) */}
      <mesh position={[0, 0, WELL_FLOOR + 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[KNOB_WELL_R * 0.98, KNOB_WELL_R * 0.78, 0.1, 44]} />
        <meshStandardMaterial color={powerColor(basin, power)} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* darker floor at the very bottom of the well */}
      <mesh position={[0, 0, WELL_FLOOR + 0.004]}>
        <circleGeometry args={[KNOB_WELL_R * 0.9, 36]} />
        <meshStandardMaterial
          color={new THREE.Color(powerColor(basin, power)).multiplyScalar(0.7).getStyle()}
          metalness={0.3}
          roughness={0.65}
        />
      </mesh>
      {/* thin rim framing the well opening, flush with the case face */}
      <mesh position={[0, 0, -0.012]}>
        <torusGeometry args={[KNOB_WELL_R, 0.026, 14, 48]} />
        <meshStandardMaterial color={powerColor(rim, power)} metalness={0.45} roughness={0.4} />
      </mesh>

      {/* tiltable cap rising OUT of the recessed dish (the only proud part) */}
      <group ref={pivot} position={[0, 0, CAP_Z]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.23, 0.2, 36]} />
          <meshStandardMaterial color={creamCap} metalness={0.08} roughness={0.4} />
        </mesh>
        {/* concave thumb dish on the cap face */}
        <mesh position={[0, 0, 0.1]}>
          <circleGeometry args={[0.13, 28]} />
          <meshStandardMaterial color={creamHi} metalness={0.08} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.103]}>
          <circleGeometry args={[0.042, 20]} />
          <meshStandardMaterial color={creamShadow} metalness={0.05} roughness={0.5} />
        </mesh>
      </group>

      {/* large invisible grab target in front of the cap: pressing anywhere in the
          dish grabs the stick (and that point becomes the floating centre). */}
      <mesh position={[0, 0, 0.14]} onPointerDown={start} onPointerUp={end} onPointerCancel={end}>
        <circleGeometry args={[GRAB, 36]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

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
