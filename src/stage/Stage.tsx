import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Vector3, MathUtils, type Camera } from 'three';
import { StudioLights } from '../shared/StudioLights';
import { ShelfLabel } from './ShelfLabel';

// The two ends of the one continuous move. progress 0 = resting on the shelf (propped, up high,
// viewed head-on); progress 1 = lying on the desk (flat, lower + forward, viewed top-down).
// Everything lerps between these by an eased progress, so the tapped device floats off the shelf
// onto the desk while the camera swings overhead - one move, no cut. Multi-instrument: each
// device has its OWN shelf slot (an x offset) and its own float progress; only the ACTIVE one
// floats to the desk, the others hold their slot.

const SHELF_Y = 3.04;
const SHELF_Z = -0.35;
const SHELF_TILT = -0.32;
// device shelf scale: a single hero fills the shelf; with several instruments they shrink + space out
const SHELF_SCALE_SOLO = 0.82;
const SHELF_SCALE_MULTI = 0.36;
const SLOT_SPACING = 1.5; // x gap between shelf slots (world units)

const PLAY_POS = new Vector3(0, -2.12, 3.1);
const PLAY_TILT = -Math.PI / 2;
const PLAY_SCALE = 1.0;

const SHELF_CAM = new Vector3(0, 2.9, 9.0);
const SHELF_TGT = new Vector3(0, 2.72, 0);
const SHELF_UP = new Vector3(0, 1, 0);
const PLAY_CAM = new Vector3(0, 5.15, 3.1);
const PLAY_TGT = new Vector3(0, -2.12, 3.1);
const PLAY_UP = new Vector3(0, 0, -1);

const INSPECT_POS = new Vector3(0, 0.4, 2.2);
const INSPECT_TILT = -0.42;
const INSPECT_SCALE = 0.92;
const INSPECT_CAM = new Vector3(0, 1.3, 9.7);
const INSPECT_TGT = new Vector3(0, 0.4, 2.2);
const INSPECT_UP = new Vector3(0, 1, 0);

const DURATION = 1.2;
const INSPECT_DURATION = 0.75;
const FLOAT_LIFT = 1.3;
const FLOAT_BOW = 1.7;

interface Spin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dragging: boolean;
}

const SPIN_TILT_MIN = -1.2;
const SPIN_TILT_MAX = 1.2;
const SPIN_FRICTION = 0.95;
const SPIN_MAX_V = 14;
const SPIN_HOLD_DECAY = 0.9;

function stepSpin(spin: Spin, dt: number): void {
  if (spin.dragging) {
    const hold = Math.pow(SPIN_HOLD_DECAY, dt * 60);
    spin.vx *= hold;
    spin.vy *= hold;
    return;
  }
  spin.vx = MathUtils.clamp(spin.vx, -SPIN_MAX_V, SPIN_MAX_V);
  spin.vy = MathUtils.clamp(spin.vy, -SPIN_MAX_V, SPIN_MAX_V);
  spin.y += spin.vy * dt;
  const nx = MathUtils.clamp(spin.x + spin.vx * dt, SPIN_TILT_MIN, SPIN_TILT_MAX);
  if (nx === spin.x) spin.vx = 0;
  spin.x = nx;
  const keep = Math.pow(SPIN_FRICTION, dt * 60);
  spin.vx *= keep;
  spin.vy *= keep;
  if (Math.abs(spin.vx) < 1e-3) spin.vx = 0;
  if (Math.abs(spin.vy) < 1e-3) spin.vy = 0;
}

function eased(t: number): number {
  const c = MathUtils.clamp(t, 0, 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

// The shelf slot pose for an instrument: propped back at its x offset up on the wall shelf.
function shelfPose(shelfX: number, scale: number): { pos: Vector3; tilt: number; scale: number } {
  return { pos: new Vector3(shelfX, SHELF_Y, SHELF_Z), tilt: SHELF_TILT, scale };
}

function WarmLights() {
  return (
    <>
      <hemisphereLight args={['#ffdca8', '#3a2616', 0.5]} />
      <pointLight position={[-4, 5, 5]} intensity={32} distance={26} decay={2} color="#ffcf8a" />
      <pointLight position={[5, 0, 4]} intensity={14} distance={22} decay={2} color="#ffb877" />
      <pointLight position={[0, 1.5, 3]} intensity={16} distance={14} decay={2} color="#ffd9a0" />
    </>
  );
}

function Room() {
  return (
    <group>
      <mesh position={[0, 0.5, -3.6]}>
        <planeGeometry args={[48, 34]} />
        <meshStandardMaterial color="#4a3122" roughness={0.96} metalness={0} />
      </mesh>
      <group position={[0, 1.95, -0.55]}>
        <mesh>
          <boxGeometry args={[11.4, 0.42, 2.5]} />
          <meshStandardMaterial color="#6e4a2f" roughness={0.72} metalness={0.04} />
        </mesh>
      </group>
      <mesh position={[0, -2.34, 1.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial color="#5e3f29" roughness={0.82} metalness={0.05} />
      </mesh>
      <mesh position={[0, -2.31, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.6, 56]} />
        <meshBasicMaterial color="#ffb463" transparent opacity={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Pose ONE device group, blending its shelf slot -> desk (fe) -> inspect (ie). `spin` is the
// user's drag rotation (applied only while inspecting). The float arc pops UP then bows FORWARD.
function applyDevicePose(
  device: Group,
  shelf: { pos: Vector3; tilt: number; scale: number },
  fe: number,
  ie: number,
  spin: Spin,
  t1: Vector3,
): void {
  t1.lerpVectors(shelf.pos, PLAY_POS, fe).lerp(INSPECT_POS, ie);
  const out = 1 - ie;
  t1.y += Math.sin(Math.sqrt(fe) * Math.PI) * FLOAT_LIFT * out;
  t1.z += Math.sin(fe * Math.PI) * FLOAT_BOW * out;
  device.position.copy(t1);
  const baseTilt = MathUtils.lerp(MathUtils.lerp(shelf.tilt, PLAY_TILT, fe), INSPECT_TILT, ie);
  device.rotation.set(baseTilt + spin.x * ie, spin.y * ie, 0);
  device.scale.setScalar(MathUtils.lerp(MathUtils.lerp(shelf.scale, PLAY_SCALE, fe), INSPECT_SCALE, ie));
}

// Pose the camera by the ACTIVE instrument's float/inspect progress (shelf -> desk -> inspect).
function applyCameraPose(camera: Camera, fe: number, ie: number, t2: Vector3, tUp: Vector3, tgt: Vector3): void {
  t2.lerpVectors(SHELF_CAM, PLAY_CAM, fe).lerp(INSPECT_CAM, ie);
  camera.position.copy(t2);
  camera.up.copy(tUp.lerpVectors(SHELF_UP, PLAY_UP, fe).lerp(INSPECT_UP, ie).normalize());
  tgt.lerpVectors(SHELF_TGT, PLAY_TGT, fe).lerp(INSPECT_TGT, ie);
  camera.lookAt(tgt);
}

function advance(p: { current: number }, target: number, step: number): void {
  if (p.current < target) p.current = Math.min(target, p.current + step);
  else if (p.current > target) p.current = Math.max(target, p.current - step);
}

// Drives the shared camera by the active instrument's float + inspect targets.
function CameraRig({ floatTarget, inspectTarget }: { floatTarget: number; inspectTarget: number }) {
  const fRaw = useRef(floatTarget);
  const iRaw = useRef(inspectTarget);
  const t2 = useRef(new Vector3());
  const tUp = useRef(new Vector3());
  const tgt = useRef(new Vector3());
  const { camera } = useThree();
  useLayoutEffect(() => {
    applyCameraPose(camera, eased(fRaw.current), eased(iRaw.current), t2.current, tUp.current, tgt.current);
    camera.updateMatrixWorld();
  }, [camera]);
  useFrame((state, dt) => {
    advance(fRaw, floatTarget, dt / DURATION);
    advance(iRaw, inspectTarget, dt / INSPECT_DURATION);
    applyCameraPose(state.camera, eased(fRaw.current), eased(iRaw.current), t2.current, tUp.current, tgt.current);
  });
  return null;
}

// One device: its own group + float/inspect progress, posed from its shelf slot. Only the active
// device gets a nonzero floatTarget (floats to the desk); the rest hold their slot. On the shelf an
// invisible catcher taps to open. `spinRef` is only meaningful for the active (inspecting) device.
function DeviceRig({
  node,
  shelf,
  floatTarget,
  inspectTarget,
  spinRef,
  showCatcher,
  onTap,
}: {
  node: ReactNode;
  shelf: { pos: Vector3; tilt: number; scale: number };
  floatTarget: number;
  inspectTarget: number;
  spinRef: React.RefObject<Spin>;
  showCatcher: boolean;
  onTap: () => void;
}) {
  const ref = useRef<Group>(null);
  const fRaw = useRef(floatTarget);
  const iRaw = useRef(inspectTarget);
  const t1 = useRef(new Vector3());
  const stop = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();
  useLayoutEffect(() => {
    if (ref.current) applyDevicePose(ref.current, shelf, eased(fRaw.current), eased(iRaw.current), spinRef.current, t1.current);
    ref.current?.updateMatrixWorld(true);
  });
  useFrame((_, dt) => {
    advance(fRaw, floatTarget, dt / DURATION);
    advance(iRaw, inspectTarget, dt / INSPECT_DURATION);
    stepSpin(spinRef.current, dt);
    if (ref.current) applyDevicePose(ref.current, shelf, eased(fRaw.current), eased(iRaw.current), spinRef.current, t1.current);
  });
  return (
    <group ref={ref}>
      {node}
      {showCatcher && (
        <mesh
          onPointerDown={stop}
          onPointerUp={(e) => {
            stop(e);
            onTap();
          }}
        >
          <sphereGeometry args={[2.4, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export interface StageInstrument {
  id: string;
  node: ReactNode;
  label: string;
}

interface StageProps {
  instruments: StageInstrument[];
  activeId: string | null; // null = shelf mode
  inspect: boolean;
  spinRef: React.RefObject<Spin>;
  onShelfTap: (id: string) => void;
  onPointerMissed: () => void;
}

// The ONE persistent canvas behind the whole app. All instruments are mounted at once (each at a
// shelf slot); tapping one floats THAT device to the desk while the camera swings overhead. Nothing
// remounts, so the float is a continuous move for every instrument.
export function Stage({ instruments, activeId, inspect, spinRef, onShelfTap, onPointerMissed }: StageProps) {
  const n = instruments.length;
  const shelfScale = n > 1 ? SHELF_SCALE_MULTI : SHELF_SCALE_SOLO;
  const camFloat = activeId ? 1 : 0;
  const camInspect = inspect ? 1 : 0;

  return (
    <Canvas
      camera={{ position: [0, 1.3, 8.7], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={onPointerMissed}
      onCreated={({ gl }) => {
        const kill = (e: Event) => e.preventDefault();
        gl.domElement.addEventListener('touchstart', kill, { passive: false });
        gl.domElement.addEventListener('touchmove', kill, { passive: false });
      }}
    >
      <WarmLights />
      <StudioLights />
      <Room />

      {instruments.map((inst, i) => {
        const shelfX = (i - (n - 1) / 2) * SLOT_SPACING;
        const isActive = inst.id === activeId;
        return (
          <group key={inst.id}>
            {/* only show the shelf label for a device resting on the shelf (not the active/played one) */}
            {!isActive && <ShelfLabel text={inst.label} x={shelfX} scale={n > 1 ? 0.5 : 1} />}
            <DeviceRig
              node={inst.node}
              shelf={shelfPose(shelfX, shelfScale)}
              floatTarget={isActive ? 1 : 0}
              inspectTarget={isActive && inspect ? 1 : 0}
              spinRef={spinRef}
              showCatcher={activeId === null}
              onTap={() => onShelfTap(inst.id)}
            />
          </group>
        );
      })}

      <CameraRig floatTarget={camFloat} inspectTarget={camInspect} />
    </Canvas>
  );
}
