import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { CHANNEL, FRONT_Z, KEYBOARD, STYLUS } from './layout';
import { PALETTE } from './palette';
import { LABEL_FONT } from './fonts';

// The tethered stylus. It rests in its channel, but comes ALIVE while you play: the pen lifts out
// and tracks the played key (tip on the key, barrel raised like a hand holding it). On release it
// HOVERS briefly (in case another note is coming), then DROPS with gravity flat onto the keys, and
// after a longer idle RETURNS to its slot. A little time-based state machine in useFrame.
const HALF = STYLUS.len / 2;
const TRACK_ANGLE = 1.16; // pen stands up-right from the tip while playing
const HOVER_LIFT = 0.3; // z lift off the plate while tracking/hovering
const HOVER_S = 0.7; // hold near the last key after release
const REST_S = 1.7; // lie on the keys after dropping, before returning
const GRAVITY = 16; // fall acceleration (world units / s^2)
const K_TRACK = 18; // follow stiffness while tracking
const K_HOVER = 9;
const K_RETURN = 5;

interface Pose {
  px: number;
  py: number;
  pz: number;
  rz: number;
}

const SLOT: Pose = { px: STYLUS.x, py: STYLUS.y, pz: FRONT_Z + 0.05, rz: 0 };

// the pen pose that puts the brass TIP (local -HALF on x) at world (kx, ky), barrel raised
function trackPose(kx: number, ky: number, plateZ: number): Pose {
  const rz = TRACK_ANGLE;
  return { px: kx + HALF * Math.cos(rz), py: ky + HALF * Math.sin(rz), pz: plateZ + HOVER_LIFT, rz };
}

function approach(cur: Pose, t: Pose, k: number, dt: number) {
  const a = Math.min(1, dt * k);
  cur.px += (t.px - cur.px) * a;
  cur.py += (t.py - cur.py) * a;
  cur.pz += (t.pz - cur.pz) * a;
  cur.rz += (t.rz - cur.rz) * a;
}

export function Stylus({ litPos, plateZ }: { litPos: [number, number] | null; plateZ: number }) {
  const { len, r } = STYLUS;
  const group = useRef<THREE.Group>(null);
  const pose = useRef<Pose>({ ...SLOT });
  const last = useRef<Pose>({ ...SLOT }); // last tracking pose (for the hover hold)
  const idle = useRef(0); // seconds since release
  const vy = useRef(0); // fall velocity
  const landed = useRef(false);
  const landAt = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30); // clamp so a stutter can't fling the physics
    const p = pose.current;

    if (litPos) {
      // TRACKING: follow the played key
      const t = trackPose(litPos[0], litPos[1], plateZ);
      approach(p, t, K_TRACK, dt);
      last.current = { ...p };
      idle.current = 0;
      vy.current = 0;
      landed.current = false;
    } else {
      idle.current += dt;
      if (idle.current < HOVER_S) {
        // HOVER: hold near the last key, tip lifted a touch
        approach(p, { ...last.current, pz: last.current.pz + 0.08 }, K_HOVER, dt);
      } else if (!landed.current) {
        // DROP: gravity pulls it down the panel + it topples flat onto the keys
        vy.current += GRAVITY * dt;
        p.py -= vy.current * dt;
        const flat = { px: p.px, py: p.py, pz: plateZ + 0.03, rz: 0.06 };
        p.pz += (flat.pz - p.pz) * Math.min(1, dt * 6);
        p.rz += (flat.rz - p.rz) * Math.min(1, dt * 6);
        const floorY = KEYBOARD.y + 0.06;
        if (p.py <= floorY) {
          p.py = floorY;
          vy.current = 0;
          landed.current = true;
          landAt.current = idle.current;
        }
      } else if (idle.current < landAt.current + REST_S) {
        // lie on the keys briefly (settle any tiny residue)
        approach(p, { ...p }, K_HOVER, dt);
      } else {
        // RETURN to the slot
        approach(p, SLOT, K_RETURN, dt);
      }
    }

    if (group.current) {
      group.current.position.set(p.px, p.py, p.pz);
      group.current.rotation.z = p.rz;
    }
  });

  return (
    <group>
      {/* the recessed channel behind the pen */}
      <mesh position={[CHANNEL.x, CHANNEL.y, FRONT_Z - 0.01]}>
        <planeGeometry args={[CHANNEL.w, CHANNEL.h]} />
        <meshStandardMaterial color={PALETTE.bodyEdge} metalness={0.2} roughness={0.7} />
      </mesh>
      {/* STYLUS label on the left of the channel */}
      <Text
        font={LABEL_FONT}
        position={[-1.95, CHANNEL.y, FRONT_Z + 0.005]}
        fontSize={0.1}
        color={PALETTE.ink}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.06}
      >
        STYLUS
      </Text>
      {/* the animated pen: barrel along x, brass tip on the left end */}
      <group ref={group}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[r * 0.82, r, len, 16]} />
          <meshStandardMaterial color={PALETTE.stylus} metalness={0.45} roughness={0.4} />
        </mesh>
        <mesh position={[-len / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[r * 0.95, r * 2.4, 16]} />
          <meshStandardMaterial color={PALETTE.stylusTip} metalness={0.85} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}
