import { useLayoutEffect, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Vector3, MathUtils, type Camera } from 'three';
import { Device } from '../instruments/hiclone/ui/three/Device';
import type { DeviceHandlers } from '../instruments/hiclone/ui/three/deviceProps';
import type { ViewModel } from '../instruments/hiclone/application/state';
import { StudioLights } from '../shared/StudioLights';
import { ShelfLabel } from './ShelfLabel';

// The two ends of the one continuous move. progress 0 = resting on the shelf (propped,
// up high, viewed head-on); progress 1 = lying on the desk (flat, lower + forward,
// viewed top-down). Everything below lerps between these by an eased progress, so the
// device floats off the shelf onto the desk while the camera swings overhead - one move,
// no cut.
// Device local bbox (measured): ~2.41 wide x 1.76 tall x 0.45 deep, pivot ~centered.
// Used to rest the device exactly on the shelf/desk instead of eyeballing.

// shelf: device RESTS on the plank (its bottom edge sits ON the plank top), propped back.
// At scale 0.82 + tilt 0.3 the lowest world point is ~0.73 below the pivot; the plank top
// is at 2.16, so the pivot sits at 2.16 + 0.73 ~ 2.9.
const SHELF_POS = new Vector3(0, 3.04, -0.35);
const SHELF_TILT = -0.32;
const SHELF_SCALE = 0.82;
// desk: device lies PERFECTLY FLAT, face up. Flat + scale 1, its lowest point is ~0.22
// below the pivot; the desk top is at -2.34, so the pivot sits at -2.34 + 0.22 ~ -2.12.
const PLAY_POS = new Vector3(0, -2.12, 2.2);
const PLAY_TILT = -Math.PI / 2;
const PLAY_SCALE = 1.0;

const SHELF_CAM = new Vector3(0, 2.9, 9.0);
const SHELF_TGT = new Vector3(0, 2.72, 0);
const SHELF_UP = new Vector3(0, 1, 0);
// PERFECTLY top-down = the old head-on view, now on the desk: camera directly above the
// flat device looking straight DOWN (distance ~7, matching the old play framing), so the
// face is fronto-parallel / 2D, no perspective skew. The up-vector swings from +Y to -Z so
// the camera's "up" stays perpendicular to the straight-down view (an exactly-vertical
// camera with +Y up is degenerate; with -Z up it is fine).
const PLAY_CAM = new Vector3(0, 5.15, 2.2);
const PLAY_TGT = new Vector3(0, -2.12, 2.2);
const PLAY_UP = new Vector3(0, 0, -1);

// inspect: the eye button floats the device UP off the desk to a centered presentation
// pose, tilted toward the viewer; the user drags to SPIN it (the device rotates in place;
// the camera stays put, so there is no camera-control handoff).
const INSPECT_POS = new Vector3(0, 0.4, 2.2);
const INSPECT_TILT = -0.42; // stood up from flat, leaning slightly back toward the viewer
const INSPECT_SCALE = 0.92;
const INSPECT_CAM = new Vector3(0, 1.3, 9.7);
const INSPECT_TGT = new Vector3(0, 0.4, 2.2);
const INSPECT_UP = new Vector3(0, 1, 0);

const DURATION = 1.2; // seconds for the full shelf<->desk float
const INSPECT_DURATION = 0.75; // seconds for the rise into / out of inspect

// float-arc shaping (shelf <-> desk). The device must POP UP off the shelf before it pulls
// forward, or its lower edge clips through the shelf plank while it's still over it. The lift
// is FRONT-LOADED (sqrt -> peaks early at ~fe 0.25) so it clears the plank top first; the
// forward bow is a later, symmetric arc that carries it out + down onto the desk.
const FLOAT_LIFT = 1.3; // vertical pop up off the shelf (clears the plank)
const FLOAT_BOW = 1.7; // forward bow off the shelf onto the desk

interface Spin {
  x: number; // tilt (rotation about X), driven by vertical drag, clamped
  y: number; // turn (rotation about Y), driven by horizontal drag, unbounded (full spins)
  vx: number; // angular velocity (rad/s) set by the drag input; the coast runs on this
  vy: number;
  dragging: boolean; // true while a finger is on it; the coast only runs once let go
}

// spin momentum tuning
const SPIN_TILT_MIN = -1.2;
const SPIN_TILT_MAX = 1.2;
const SPIN_FRICTION = 0.95; // velocity retained per 60fps-frame after release (-> ~1s coast)
const SPIN_MAX_V = 14; // rad/s cap so a hard flick doesn't spin absurdly fast
const SPIN_HOLD_DECAY = 0.9; // velocity bled per frame WHILE held, so a stop-then-lift doesn't fling

// One spin step per frame. The INPUT layer (Experience) owns position + velocity while a finger
// is down (velocity from real pointer-event timing); here we only (a) bleed velocity while the
// finger rests so a held pause kills the fling, and (b) once released, integrate the carried
// velocity and decay it toward rest - the floaty coast.
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
  if (nx === spin.x) spin.vx = 0; // hit the tilt clamp -> stop pressing into it
  spin.x = nx;
  const keep = Math.pow(SPIN_FRICTION, dt * 60); // frame-rate independent decay
  spin.vx *= keep;
  spin.vy *= keep;
  if (Math.abs(spin.vx) < 1e-3) spin.vx = 0;
  if (Math.abs(spin.vy) < 1e-3) spin.vy = 0;
}

// smootherstep (ease-in-out, zero velocity + accel at both ends) for a soft float
function eased(t: number): number {
  const c = MathUtils.clamp(t, 0, 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

// Warm "cozy room" wash + a couple of amber lamps, layered over the studio rig (which
// gives the metal its sheen). Same lighting on the shelf AND the desk, so there is no
// warm-to-cold shift across the move.
function WarmLights() {
  return (
    <>
      <hemisphereLight args={['#ffdca8', '#3a2616', 0.5]} />
      <pointLight position={[-4, 5, 5]} intensity={32} distance={26} decay={2} color="#ffcf8a" />
      <pointLight position={[5, 0, 4]} intensity={14} distance={22} decay={2} color="#ffb877" />
      {/* a warm desk lamp pooled over the play area */}
      <pointLight position={[0, 1.5, 3]} intensity={16} distance={14} decay={2} color="#ffd9a0" />
    </>
  );
}

// The cozy room: a warm back wall, a wooden wall-shelf up high, and a wooden desk below.
// The device rests on the shelf and floats down onto the desk.
function Room() {
  return (
    <group>
      <mesh position={[0, 0.5, -3.6]}>
        <planeGeometry args={[48, 34]} />
        <meshStandardMaterial color="#4a3122" roughness={0.96} metalness={0} />
      </mesh>
      {/* wall shelf (up high) - its top sits just under the device's resting bottom */}
      <group position={[0, 1.95, -0.55]}>
        <mesh>
          <boxGeometry args={[9.4, 0.42, 2.5]} />
          <meshStandardMaterial color="#6e4a2f" roughness={0.72} metalness={0.04} />
        </mesh>
      </group>
      {/* desk surface (low, in front) - the device lies flat on it */}
      <mesh position={[0, -2.34, 1.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial color="#5e3f29" roughness={0.82} metalness={0.05} />
      </mesh>
      {/* a soft warm pool of light on the desk under the play position */}
      <mesh position={[0, -2.31, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.6, 56]} />
        <meshBasicMaterial color="#ffb463" transparent opacity={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Drives the ONE continuous move: advances a progress toward the target (shelf=0,
// play=1) and lerps the camera + the device group between the two poses every frame.
// Pose the camera + device at eased progress `e`. Used by the render loop AND once
// before the first paint (so the very first frame is already posed - no unposed/clipping
// flash at the device's default origin).
// Blend pose across THREE poses: shelf <-(fe)-> play, then that <-(ie)-> inspect. `spin`
// is the user's drag rotation, applied only as it inspects (scaled by ie). Used by the
// render loop AND once before the first paint (so the first frame is already posed).
function applyPose(
  camera: Camera,
  device: Group | null,
  fe: number,
  ie: number,
  spin: Spin,
  t1: Vector3,
  t2: Vector3,
  tUp: Vector3,
): void {
  if (device) {
    t1.lerpVectors(SHELF_POS, PLAY_POS, fe).lerp(INSPECT_POS, ie);
    // float arc: pop UP first (front-loaded, so it clears the shelf plank before pulling
    // forward), then bow FORWARD onto the desk. Both fade out for inspect (ie).
    const out = 1 - ie;
    t1.y += Math.sin(Math.sqrt(fe) * Math.PI) * FLOAT_LIFT * out;
    t1.z += Math.sin(fe * Math.PI) * FLOAT_BOW * out;
    device.position.copy(t1);
    const baseTilt = MathUtils.lerp(MathUtils.lerp(SHELF_TILT, PLAY_TILT, fe), INSPECT_TILT, ie);
    device.rotation.set(baseTilt + spin.x * ie, spin.y * ie, 0);
    device.scale.setScalar(MathUtils.lerp(MathUtils.lerp(SHELF_SCALE, PLAY_SCALE, fe), INSPECT_SCALE, ie));
  }
  t2.lerpVectors(SHELF_CAM, PLAY_CAM, fe).lerp(INSPECT_CAM, ie);
  camera.position.copy(t2);
  // up swings +Y -> -Z for the straight-down desk view, then back to +Y for inspect
  camera.up.copy(tUp.lerpVectors(SHELF_UP, PLAY_UP, fe).lerp(INSPECT_UP, ie).normalize());
  t1.lerpVectors(SHELF_TGT, PLAY_TGT, fe).lerp(INSPECT_TGT, ie);
  camera.lookAt(t1);
}

function advance(p: { current: number }, target: number, step: number): void {
  if (p.current < target) p.current = Math.min(target, p.current + step);
  else if (p.current > target) p.current = Math.max(target, p.current - step);
}

function Rig({
  floatTarget,
  inspectTarget,
  spinRef,
  deviceRef,
}: {
  floatTarget: number;
  inspectTarget: number;
  spinRef: React.RefObject<Spin>;
  deviceRef: React.RefObject<Group | null>;
}) {
  const fRaw = useRef(floatTarget); // snap to the initial mode (deep-links don't animate in)
  const iRaw = useRef(inspectTarget);
  const t1 = useRef(new Vector3());
  const t2 = useRef(new Vector3());
  const tUp = useRef(new Vector3());
  const { camera } = useThree();
  // pose everything before the first paint (matrices forced current so the FIRST 3D frame
  // is already posed - no unposed/clipping flash, no edge-on flash)
  useLayoutEffect(() => {
    applyPose(camera, deviceRef.current, eased(fRaw.current), eased(iRaw.current), spinRef.current, t1.current, t2.current, tUp.current);
    camera.updateMatrixWorld();
    deviceRef.current?.updateMatrixWorld(true);
  }, [camera, deviceRef, spinRef]);
  useFrame((state, dt) => {
    advance(fRaw, floatTarget, dt / DURATION);
    advance(iRaw, inspectTarget, dt / INSPECT_DURATION);
    stepSpin(spinRef.current, dt); // coast the inspect spin (input layer sets pos+velocity)
    applyPose(state.camera, deviceRef.current, eased(fRaw.current), eased(iRaw.current), spinRef.current, t1.current, t2.current, tUp.current);
  });
  return null;
}

interface StageProps {
  mode: 'shelf' | 'play';
  inspect: boolean; // eye button: float the device up + let the user spin it
  spinRef: React.RefObject<Spin>; // the user's drag-spin (applied while inspecting)
  vm: ViewModel;
  handlers: DeviceHandlers; // real handlers when interactive, no-ops otherwise
  onShelfTap: () => void; // tap the shelved instrument -> float it to the desk
  label: string; // the instrument name, scrawled on the paper taped to the shelf
}

// The ONE persistent canvas behind the whole app. The shelf, the desk play view, and the
// raised inspect pose are the same scene; only `mode` + `inspect` (and the resulting camera
// + device pose) change. Mounted once at the app root so nothing ever remounts -> no cut.
export function Stage({ mode, inspect, spinRef, vm, handlers, onShelfTap, label }: StageProps) {
  const deviceRef = useRef<Group>(null);
  const floatTarget = mode === 'play' ? 1 : 0;
  const inspectTarget = inspect ? 1 : 0;
  const stop = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();

  return (
    <Canvas
      camera={{ position: [0, 1.3, 8.7], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => handlers.onJoyEnd()}
      onCreated={({ gl }) => {
        const kill = (e: Event) => e.preventDefault();
        gl.domElement.addEventListener('touchstart', kill, { passive: false });
        gl.domElement.addEventListener('touchmove', kill, { passive: false });
      }}
    >
      <WarmLights />
      <StudioLights />
      <Room />
      <ShelfLabel text={label} />
      <group ref={deviceRef}>
        <Device vm={vm} handlers={handlers} />
        {/* on the shelf, a tap anywhere on the instrument floats it to the desk; the
            device's own pads are inert here (handlers are no-ops until it lands).
            Fire on onPointerUp, NOT onClick: the onCreated touchstart-preventDefault
            (the iOS magnifier fix) suppresses the synthetic click on touch, so an
            onClick catcher is dead on a phone - pointer events still fire. */}
        {mode === 'shelf' && (
          <mesh
            onPointerDown={stop}
            onPointerUp={(e) => {
              stop(e);
              onShelfTap();
            }}
          >
            <sphereGeometry args={[2.4, 16, 16]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
      <Rig floatTarget={floatTarget} inspectTarget={inspectTarget} spinRef={spinRef} deviceRef={deviceRef} />
    </Canvas>
  );
}
