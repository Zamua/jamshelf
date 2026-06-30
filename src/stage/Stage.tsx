import { useLayoutEffect, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Vector3, MathUtils, type Camera } from 'three';
import { Device } from '../instruments/hichord/ui/three/Device';
import type { DeviceHandlers } from '../instruments/hichord/ui/three/deviceProps';
import type { ViewModel } from '../instruments/hichord/application/state';
import { StudioLights } from '../shared/StudioLights';

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
const SHELF_POS = new Vector3(0, 2.9, 0.15);
const SHELF_TILT = 0.3;
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

const DURATION = 1.2; // seconds for the full float

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
function applyPose(camera: Camera, device: Group | null, e: number, tmp: Vector3, tmpUp: Vector3): void {
  camera.position.lerpVectors(SHELF_CAM, PLAY_CAM, e);
  // swing the up-vector +Y -> -Z so the camera can look straight down at the desk
  camera.up.copy(tmpUp.lerpVectors(SHELF_UP, PLAY_UP, e).normalize());
  camera.lookAt(tmp.lerpVectors(SHELF_TGT, PLAY_TGT, e));
  if (device) {
    device.position.lerpVectors(SHELF_POS, PLAY_POS, e);
    // arc FORWARD (toward the viewer) mid-float, so the device lifts off the shelf and
    // floats out + down onto the desk in a graceful curve instead of dropping through it.
    device.position.z += Math.sin(e * Math.PI) * 1.7;
    device.rotation.x = MathUtils.lerp(SHELF_TILT, PLAY_TILT, e);
    device.scale.setScalar(MathUtils.lerp(SHELF_SCALE, PLAY_SCALE, e));
  }
}

function Rig({ target, deviceRef }: { target: number; deviceRef: React.RefObject<Group | null> }) {
  const raw = useRef(target); // snap to the initial mode (deep-links don't animate in)
  const tmp = useRef(new Vector3());
  const tmpUp = useRef(new Vector3());
  const { camera } = useThree();
  // pose everything before the first paint (matrices forced current so the FIRST 3D frame
  // is already posed - no unposed/clipping flash, no edge-on flash)
  useLayoutEffect(() => {
    applyPose(camera, deviceRef.current, eased(raw.current), tmp.current, tmpUp.current);
    camera.updateMatrixWorld();
    deviceRef.current?.updateMatrixWorld(true);
  }, [camera, deviceRef]);
  useFrame((state, dt) => {
    const step = dt / DURATION;
    if (raw.current < target) raw.current = Math.min(target, raw.current + step);
    else if (raw.current > target) raw.current = Math.max(target, raw.current - step);
    applyPose(state.camera, deviceRef.current, eased(raw.current), tmp.current, tmpUp.current);
  });
  return null;
}

interface StageProps {
  mode: 'shelf' | 'play';
  vm: ViewModel;
  handlers: DeviceHandlers; // real handlers when interactive, no-ops otherwise
  onShelfTap: () => void; // tap the shelved instrument -> float it to the desk
}

// The ONE persistent canvas behind the whole app. The shelf and the play view are the
// same scene at two ends of a continuous move; only `mode` (and the resulting camera +
// device pose) changes. Mounted once at the app root so nothing ever remounts -> no cut.
export function Stage({ mode, vm, handlers, onShelfTap }: StageProps) {
  const deviceRef = useRef<Group>(null);
  const target = mode === 'play' ? 1 : 0;
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
      <group ref={deviceRef}>
        <Device vm={vm} handlers={handlers} />
        {/* on the shelf, a tap anywhere on the instrument floats it to the desk; the
            device's own pads are inert here (handlers are no-ops until it lands) */}
        {mode === 'shelf' && (
          <mesh onPointerDown={stop} onClick={onShelfTap}>
            <sphereGeometry args={[2.4, 16, 16]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
      <Rig target={target} deviceRef={deviceRef} />
    </Canvas>
  );
}
