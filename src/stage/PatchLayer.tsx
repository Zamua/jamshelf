import { useMemo } from 'react';
import { CatmullRomCurve3, Vector3, TubeGeometry } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Placement } from '../rig/rigStore';

// The virtual patch bay for a rig: an output jack on every non-looper device on the desk, an input
// jack on the looper, and a cable for each active wire. Tapping a device's jack toggles whether it
// is patched into the looper's input (the RC-505 model: everything wired in sums to one input bus,
// and recording captures whatever's playing). Shown only in the rig all-view. (Drag-to-patch is a
// later refinement; tap-to-connect keeps it robust on a phone.)

const LOOPER_ID = 'loopclone';
type XYZ = [number, number, number];

// A cable: a tube along a gently up-bowed curve between two desk points. In patch mode, tapping it unplugs.
function Cable({ from, to, onTap }: { from: XYZ; to: XYZ; onTap?: () => void }) {
  const geo = useMemo(() => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.55; // bow up off the desk so it reads as a slack cable
    return new TubeGeometry(new CatmullRomCurve3([a, mid, b]), 24, 0.03, 8, false);
  }, [from, to]);
  return (
    <mesh
      geometry={geo}
      onPointerDown={onTap ? (e: ThreeEvent<PointerEvent>) => e.stopPropagation() : undefined}
      onPointerUp={
        onTap
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onTap();
            }
          : undefined
      }
    >
      <meshStandardMaterial color="#d0483c" roughness={0.55} metalness={0.1} />
    </mesh>
  );
}

// A jack: a socket with an accent ring (always visible so it's findable), lit brighter when patched,
// plus a dark hole. A big invisible disc makes it an easy tap target. Tapping toggles the wire.
function Jack({ pos, on, onTap }: { pos: XYZ; on: boolean; onTap: () => void }) {
  const handleUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onTap();
  };
  const stop = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();
  return (
    <group position={pos}>
      {/* Easy tap target (a flat disc just above the device surface). The device tap-to-focus catcher
          spheres are turned OFF in patch mode, so this receives the tap without competing with them. */}
      <mesh position={[0, 0.06, 0]} onPointerDown={stop} onPointerUp={handleUp}>
        <cylinderGeometry args={[0.34, 0.34, 0.04, 20]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* accent ring (red) - dim when unpatched, glowing when patched */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <torusGeometry args={[0.2, 0.05, 10, 24]} />
        <meshStandardMaterial color="#e0453a" emissive="#e0453a" emissiveIntensity={on ? 0.9 : 0.25} toneMapped={false} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* socket body + hole (flat coins, round face up) */}
      <mesh>
        <cylinderGeometry args={[0.19, 0.21, 0.09, 22]} />
        <meshStandardMaterial color={on ? '#8a2820' : '#2a2d31'} metalness={0.45} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.055, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 16]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function PatchLayer({ placements, wires, deskY, editable, onToggleWire }: { placements: Record<string, Placement>; wires: string[]; deskY: number; editable: boolean; onToggleWire: (id: string) => void }) {
  const looper = placements[LOOPER_ID];
  if (!looper) return null;
  const y = deskY + 0.16;
  const looperPos: XYZ = [looper.x, y, looper.z];
  const devices = Object.keys(placements).filter((id) => id !== LOOPER_ID);

  return (
    <group>
      {/* the looper's input jack (a larger dark socket) */}
      <group position={looperPos}>
        <mesh>
          <cylinderGeometry args={[0.24, 0.26, 0.08, 26]} />
          <meshStandardMaterial color="#141518" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.05, 18]} />
          <meshStandardMaterial color="#0a0b0d" roughness={0.9} />
        </mesh>
      </group>

      {/* an output jack per device, offset toward the looper so it reads as the output side */}
      {devices.map((id) => {
        const p = placements[id];
        const dx = looper.x - p.x;
        const dz = looper.z - p.z;
        const len = Math.hypot(dx, dz) || 1;
        const jp: XYZ = [p.x + (dx / len) * 0.5, y, p.z + (dz / len) * 0.5];
        const on = wires.includes(id);
        return (
          <group key={id}>
            {editable && <Jack pos={jp} on={on} onTap={() => onToggleWire(id)} />}
            {on && <Cable from={jp} to={looperPos} onTap={editable ? () => onToggleWire(id) : undefined} />}
          </group>
        );
      })}
    </group>
  );
}
