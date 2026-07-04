import { useMemo } from 'react';
import { CatmullRomCurve3, Vector3, Quaternion, TubeGeometry } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Placement } from '../rig/rigStore';

// The virtual patch bay for a rig. Every device gets an OUTPUT port on its BACK edge (real gear has
// its jacks on the back panel) and cables run back-to-back to input ports on the looper's back edge.
// A device lies flat via FLAT_Q (-90deg about X, face up), so its rear/top edge maps to world -Z, then
// yaws - i.e. a device's back direction is (-sin(yaw), 0, -cos(yaw)). Shown only in the rig all-view;
// tap a device's port in wire mode to patch/unpatch it (the RC-505 model: all wired sources sum into
// the looper's input, and recording captures whatever is playing).

const LOOPER_ID = 'loopclone';
const UP = new Vector3(0, 1, 0);
// A flat device's pivot is at deskY and it is ~0.28 thick, so its side/back face is centred on deskY;
// sit the ports just above centre so they read as set into the back face, not the top surface.
const JACK_Y_OFF = 0.04;
const EDGE_BACK = 0.56; // device center -> its back edge
const EDGE_LOOP = 0.52; // looper center -> its back edge
const PORT_SPREAD = 0.34; // spacing between the looper's back-panel input ports
const PLUG_OUT = 0.08; // how far past the port the cable attaches (the boot)
const SIDE_CLEAR = 1.05; // how far beside a device the cable detours, to clear its ~0.75 half-footprint
type XYZ = [number, number, number];

// The world back direction of a device flat on the desk with the given yaw.
function backDir(yaw: number): XYZ {
  return [-Math.sin(yaw), 0, -Math.cos(yaw)];
}

// A slack patch cable. It leaves each plug straight along that plug's back axis, then routes AROUND
// the source device's side (via `via`, a waypoint beside the device) so it never cuts across the
// device face - the back port is on the far side from the looper, so a straight drape would clip it.
function Cable({ a, b, dirA, dirB, via, onTap }: { a: XYZ; b: XYZ; dirA: XYZ; dirB: XYZ; via: XYZ; onTap?: () => void }) {
  const geo = useMemo(() => {
    const A = new Vector3(...a);
    const B = new Vector3(...b);
    const V = new Vector3(...via);
    const dA = new Vector3(...dirA).normalize();
    const dB = new Vector3(...dirB).normalize();
    const len = A.distanceTo(B) || 1;
    const stub = Math.min(0.28, len * 0.24); // a short fixed exit out of the plug
    const p1 = A.clone().addScaledVector(dA, stub); // exit A's back, straight
    const p3 = B.clone().addScaledVector(dB, stub); // approach B's back, straight
    // A -> exit -> around the device's side -> looper approach -> B. The lift gives it desk-cable body.
    V.y += 0.04 + 0.02 * len;
    return new TubeGeometry(new CatmullRomCurve3([A, p1, V, p3, B]), 64, 0.016, 7, false);
  }, [a, b, dirA, dirB, via]);
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

// A port/plug set into a back edge. `axis` points AWAY from the host (the way the cable leaves); the
// metal barrel runs the other way, into the host. A colored collar (lit when patched) + a boot.
function Plug({ base, axis, on }: { base: XYZ; axis: XYZ; on: boolean }) {
  const q = useMemo(() => new Quaternion().setFromUnitVectors(UP, new Vector3(...axis).normalize()), [axis]);
  return (
    <group position={base} quaternion={q}>
      {/* metal barrel, into the host (local -Y) */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.13, 12]} />
        <meshStandardMaterial color="#c6c8cc" metalness={0.75} roughness={0.28} />
      </mesh>
      {/* colored collar at the panel */}
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

// A flat tap target (round face up, so the top-down ray hits it) shown in wire mode over a port.
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
      <cylinderGeometry args={[0.32, 0.32, 0.04, 18]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function PatchLayer({ placements, wires, deskY, editable, onToggleWire }: { placements: Record<string, Placement>; wires: string[]; deskY: number; editable: boolean; onToggleWire: (id: string) => void }) {
  const looper = placements[LOOPER_ID];
  if (!looper) return null;
  const y = deskY + JACK_Y_OFF;
  const devices = Object.keys(placements).filter((id) => id !== LOOPER_ID);
  const wired = devices.filter((id) => wires.includes(id));

  const lbd = backDir(looper.yaw); // looper back direction
  const lperp: XYZ = [-lbd[2], 0, lbd[0]]; // along the looper's back edge (to spread its input ports)

  return (
    <group>
      {devices.map((id) => {
        const p = placements[id];
        const dbd = backDir(p.yaw); // this device's back direction
        // the device's output port on its back edge (barrel INTO the device = -dbd; cable leaves +dbd)
        const devBase: XYZ = [p.x + dbd[0] * EDGE_BACK, y, p.z + dbd[2] * EDGE_BACK];
        const devAttach: XYZ = [devBase[0] + dbd[0] * PLUG_OUT, y, devBase[2] + dbd[2] * PLUG_OUT];
        // the matching input port on the looper's back edge, spread so multiple cables do not overlap
        const wi = wired.indexOf(id);
        const spread = wired.length > 1 ? (wi - (wired.length - 1) / 2) * PORT_SPREAD : 0;
        const loopBase: XYZ = [looper.x + lbd[0] * EDGE_LOOP + lperp[0] * spread, y, looper.z + lbd[2] * EDGE_LOOP + lperp[2] * spread];
        const loopAttach: XYZ = [loopBase[0] + lbd[0] * PLUG_OUT, y, loopBase[2] + lbd[2] * PLUG_OUT];
        const on = wires.includes(id);
        // Route AROUND the device: a waypoint beside it, on its OUTER side (away from the looper's x),
        // so the cable never crosses the device face on its way from the back port to the looper.
        const tlx = loopBase[0] - p.x;
        const tlz = loopBase[2] - p.z;
        const tl = Math.hypot(tlx, tlz) || 1;
        let side: XYZ = [-tlz / tl, 0, tlx / tl]; // perpendicular to device->looper, in the desk plane
        const outward = p.x - looper.x >= 0 ? 1 : -1; // detour on the side away from the looper's center
        if (Math.sign(side[0]) !== outward && side[0] !== 0) side = [-side[0], 0, -side[2]];
        const via: XYZ = [p.x + side[0] * SIDE_CLEAR, y, p.z + side[2] * SIDE_CLEAR];
        return (
          <group key={id}>
            {editable && <TapDisc pos={[devBase[0], y, devBase[2]]} onTap={() => onToggleWire(id)} />}
            {(on || editable) && <Plug base={devBase} axis={dbd} on={on} />}
            {on && (
              <>
                <Plug base={loopBase} axis={lbd} on={on} />
                <Cable a={devAttach} b={loopAttach} dirA={dbd} dirB={lbd} via={via} onTap={editable ? () => onToggleWire(id) : undefined} />
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}
