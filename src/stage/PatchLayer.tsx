import { useMemo } from 'react';
import { CatmullRomCurve3, Vector3, Quaternion, TubeGeometry } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Placement } from '../rig/rigStore';

// The virtual patch bay for a rig: a PLUG inserted into each wired device's side edge, a matching plug
// on the looper's side, and a slack cable running between them - a device's output summed into the
// looper's input bus (the RC-505 model; recording captures whatever's playing on the wired sources).
// Shown only in the rig all-view. Tap-to-connect in wire mode (drag fought the tap-to-focus catchers).

const LOOPER_ID = 'loopclone';
const UP = new Vector3(0, 1, 0);
// A device lies flat with its pivot at deskY and is ~0.28 thick, so its side face is centred on deskY;
// sit the jacks just above centre so they read as inserted into the SIDE (not the top face).
const JACK_Y_OFF = 0.04;
const EDGE_DEV = 0.58; // device center -> its side jack (~the flat footprint edge)
const EDGE_LOOP = 0.82; // looper center -> its side jack (it is wider)
const PLUG_OUT = 0.08; // how far past the edge the cable attaches (the boot)
type XYZ = [number, number, number];

// A stable pseudo-random in [0,1) from a seed, so each cable's slack/bow is varied but doesn't jitter.
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// A slack patch cable: it leaves its plug straight (in the plug's axis), bows to one side and lifts a
// little in the middle (natural slack, a stable per-cable amount + side), then enters the far plug
// straight - not a taut line.
function Cable({ a, b, dir, seed, onTap }: { a: XYZ; b: XYZ; dir: XYZ; seed: number; onTap?: () => void }) {
  const geo = useMemo(() => {
    const A = new Vector3(...a);
    const B = new Vector3(...b);
    const d = new Vector3(...dir).normalize();
    const perp = new Vector3(-d.z, 0, d.x); // sideways in the desk plane
    const len = A.distanceTo(B);
    const r = hash01(seed);
    const bow = (0.1 + r * 0.16) * len * (r > 0.5 ? 1 : -1);
    const p1 = A.clone().addScaledVector(d, len * 0.24); // exit the plug straight
    const mid = A.clone().add(B).multiplyScalar(0.5).addScaledVector(perp, bow);
    mid.y += 0.06 + 0.03 * len; // slight lift so it lies just above the desk
    const p3 = B.clone().addScaledVector(d, -len * 0.24); // enter the far plug straight
    return new TubeGeometry(new CatmullRomCurve3([A, p1, mid, p3, B]), 56, 0.016, 7, false);
  }, [a, b, dir, seed]);
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
      <meshStandardMaterial color="#c9463b" roughness={0.5} metalness={0.05} />
    </mesh>
  );
}

// A plug inserted into a SIDE edge. `axis` points AWAY from the host (the direction the cable leaves);
// the metal barrel runs the other way, into the host. A colored collar (lit when patched) + a rubber
// strain-relief boot the cable exits from.
function Plug({ base, axis, on }: { base: XYZ; axis: XYZ; on: boolean }) {
  const q = useMemo(() => new Quaternion().setFromUnitVectors(UP, new Vector3(...axis).normalize()), [axis]);
  return (
    <group position={base} quaternion={q}>
      {/* metal barrel, inserted into the host (local -Y) */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.13, 12]} />
        <meshStandardMaterial color="#c6c8cc" metalness={0.75} roughness={0.28} />
      </mesh>
      {/* colored collar at the edge */}
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.07, 16]} />
        <meshStandardMaterial color={on ? '#e0453a' : '#3a3d42'} emissive={on ? '#e0453a' : '#000000'} emissiveIntensity={on ? 0.55 : 0} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* rubber strain-relief boot (the cable leaves here, local +Y) */}
      <mesh position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.022, 0.04, 0.06, 10]} />
        <meshStandardMaterial color="#17181b" roughness={0.75} />
      </mesh>
    </group>
  );
}

// A flat tap target (round face up, so the top-down ray hits it) shown in wire mode over a plug.
function TapDisc({ pos, onTap }: { pos: XYZ; onTap: () => void }) {
  return (
    <mesh
      position={pos}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onTap();
      }}
    >
      <cylinderGeometry args={[0.34, 0.34, 0.04, 18]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function PatchLayer({ placements, wires, deskY, editable, onToggleWire }: { placements: Record<string, Placement>; wires: string[]; deskY: number; editable: boolean; onToggleWire: (id: string) => void }) {
  const looper = placements[LOOPER_ID];
  if (!looper) return null;
  const y = deskY + JACK_Y_OFF;
  const devices = Object.keys(placements).filter((id) => id !== LOOPER_ID);

  return (
    <group>
      {devices.map((id) => {
        const p = placements[id];
        const dx = looper.x - p.x;
        const dz = looper.z - p.z;
        const len = Math.hypot(dx, dz) || 1;
        const dir: XYZ = [dx / len, 0, dz / len]; // device -> looper (in the desk plane)
        const back: XYZ = [-dir[0], 0, -dir[2]];
        // the device plug sits at its side edge (barrel points INTO the device = -dir; cable leaves +dir)
        const devBase: XYZ = [p.x + dir[0] * EDGE_DEV, y, p.z + dir[2] * EDGE_DEV];
        const devAttach: XYZ = [devBase[0] + dir[0] * PLUG_OUT, y, devBase[2] + dir[2] * PLUG_OUT];
        // the looper plug sits on the looper's side facing this device (barrel INTO looper; cable leaves -dir)
        const loopBase: XYZ = [looper.x - dir[0] * EDGE_LOOP, y, looper.z - dir[2] * EDGE_LOOP];
        const loopAttach: XYZ = [loopBase[0] - dir[0] * PLUG_OUT, y, loopBase[2] - dir[2] * PLUG_OUT];
        const on = wires.includes(id);
        const seed = p.x * 3.1 + p.z * 7.7 + 1;
        return (
          <group key={id}>
            {editable && <TapDisc pos={[devBase[0], y, devBase[2]]} onTap={() => onToggleWire(id)} />}
            {(on || editable) && <Plug base={devBase} axis={dir} on={on} />}
            {on && (
              <>
                <Plug base={loopBase} axis={back} on={on} />
                <Cable a={devAttach} b={loopAttach} dir={dir} seed={seed} onTap={editable ? () => onToggleWire(id) : undefined} />
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}
