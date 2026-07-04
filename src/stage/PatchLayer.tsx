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
const DEVICE_R = 0.92; // a device's ~half-footprint + clearance, as the circle a cable must skirt
type XYZ = [number, number, number];

// The world back direction of a device flat on the desk with the given yaw.
function backDir(yaw: number): XYZ {
  return [-Math.sin(yaw), 0, -Math.cos(yaw)];
}

interface Obstacle {
  x: number;
  z: number;
  r: number;
}

// Route a cable from A to B (exiting each along its back axis) AROUND every device on the desk. A
// rubber-band relaxation: sample the path, then repeatedly (a) pull each point toward the midpoint of
// its neighbours (toward taut) and (b) push it out of any device circle it lands inside. Converges to
// a path that hugs the obstacles' edges. `initSide` seeds which way it bows so it commits to one side.
function routeAround(A: XYZ, B: XYZ, dirA: XYZ, dirB: XYZ, obstacles: Obstacle[], initSide: XYZ): XYZ[] {
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]) || 1;
  const stub = Math.min(0.3, len * 0.24);
  const s: [number, number] = [A[0] + dirA[0] * stub, A[2] + dirA[2] * stub]; // exit guide (fixed)
  const e: [number, number] = [B[0] + dirB[0] * stub, B[2] + dirB[2] * stub]; // approach guide (fixed)
  const N = 18;
  const pts: [number, number][] = [];
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const bow = Math.sin(t * Math.PI); // 0 at the ends, 1 in the middle
    pts.push([s[0] + (e[0] - s[0]) * t + initSide[0] * bow * 0.6, s[1] + (e[1] - s[1]) * t + initSide[2] * bow * 0.6]);
  }
  for (let iter = 0; iter < 18; iter++) {
    for (let k = 0; k < pts.length; k++) {
      const prev = k === 0 ? s : pts[k - 1];
      const next = k === pts.length - 1 ? e : pts[k + 1];
      pts[k][0] = (pts[k][0] + prev[0] + next[0]) / 3; // relax toward taut
      pts[k][1] = (pts[k][1] + prev[1] + next[1]) / 3;
      for (const o of obstacles) {
        const dx = pts[k][0] - o.x;
        const dz = pts[k][1] - o.z;
        const d = Math.hypot(dx, dz);
        if (d < o.r) {
          if (d < 1e-3) {
            pts[k][0] = o.x + initSide[0] * o.r;
            pts[k][1] = o.z + initSide[2] * o.r;
          } else {
            pts[k][0] = o.x + (dx / d) * o.r;
            pts[k][1] = o.z + (dz / d) * o.r;
          }
        }
      }
    }
  }
  const y = A[1];
  const out: XYZ[] = [A, [s[0], y, s[1]]];
  for (const pt of pts) out.push([pt[0], y, pt[1]]);
  out.push([e[0], y, e[1]], B);
  return out;
}

// A slack patch cable through the routed points (a little bell-curve lift so it lies just off the desk).
function Cable({ pts, onTap }: { pts: XYZ[]; onTap?: () => void }) {
  const geo = useMemo(() => {
    const n = pts.length;
    const vs = pts.map((p, i) => {
      const t = i / (n - 1);
      return new Vector3(p[0], p[1] + Math.sin(t * Math.PI) * 0.12, p[2]);
    });
    return new TubeGeometry(new CatmullRomCurve3(vs), Math.max(40, n * 5), 0.016, 7, false);
  }, [pts]);
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
        // Obstacles = every device on the desk (incl. this one). The looper is left out: the cable
        // ends on its back edge, approaching from outside, so it never crosses the looper body.
        const obstacles: Obstacle[] = devices.map((oid) => ({ x: placements[oid].x, z: placements[oid].z, r: DEVICE_R }));
        // Seed which way the route bows: outward from the looper's center, so cables fan to the edges.
        const tlx = loopBase[0] - p.x;
        const tlz = loopBase[2] - p.z;
        const tl = Math.hypot(tlx, tlz) || 1;
        let side: XYZ = [-tlz / tl, 0, tlx / tl];
        const outward = p.x - looper.x >= 0 ? 1 : -1;
        if (Math.sign(side[0]) !== outward && side[0] !== 0) side = [-side[0], 0, -side[2]];
        const pts = on ? routeAround(devAttach, loopAttach, dbd, lbd, obstacles, side) : [];
        return (
          <group key={id}>
            {editable && <TapDisc pos={[devBase[0], y, devBase[2]]} onTap={() => onToggleWire(id)} />}
            {(on || editable) && <Plug base={devBase} axis={dbd} on={on} />}
            {on && (
              <>
                <Plug base={loopBase} axis={lbd} on={on} />
                <Cable pts={pts} onTap={editable ? () => onToggleWire(id) : undefined} />
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}
