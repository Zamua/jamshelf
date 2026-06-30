import { useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Group, Vector3, MathUtils } from 'three';
import { Device } from '../instruments/hichord/ui/three/Device';
import type { DeviceHandlers } from '../instruments/hichord/ui/three/deviceProps';
import type { ViewModel } from '../instruments/hichord/application/state';
import { StudioLights } from '../shared/StudioLights';

// The two ends of the one continuous move. progress 0 = resting on the shelf (propped,
// up high, viewed head-on); progress 1 = lying on the desk (flat, lower + forward,
// viewed top-down). Everything below lerps between these by an eased progress, so the
// device floats off the shelf onto the desk while the camera swings overhead - one move,
// no cut.
const SHELF_POS = new Vector3(0, 1.5, 0);
const PLAY_POS = new Vector3(0, -1.74, 0.6);
const SHELF_TILT = 0.34; // propped back on the shelf
const PLAY_TILT = -Math.PI / 2 + 0.08; // lying near-flat on the desk, face up
const SHELF_SCALE = 0.82;
const PLAY_SCALE = 1.02;

const SHELF_CAM = new Vector3(0, 1.3, 8.7);
const SHELF_TGT = new Vector3(0, 1.45, 0);
// a 3/4 look DOWN at the desk (~54 deg below horizontal), so the device reads as lying
// on the desk in perspective in front of you, not floating head-on.
const PLAY_CAM = new Vector3(0, 4.7, 5.4);
const PLAY_TGT = new Vector3(0, -1.7, 0.25);

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
      {/* wall shelf (up high) */}
      <group position={[0, 0.95, -0.7]}>
        <mesh>
          <boxGeometry args={[9.4, 0.4, 2.4]} />
          <meshStandardMaterial color="#6e4a2f" roughness={0.72} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.04, 1.2]}>
          <boxGeometry args={[9.4, 0.32, 0.05]} />
          <meshStandardMaterial color="#7e5636" roughness={0.6} metalness={0.05} />
        </mesh>
      </group>
      {/* desk surface (low, in front) */}
      <mesh position={[0, -2.35, 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 16]} />
        <meshStandardMaterial color="#5e3f29" roughness={0.82} metalness={0.05} />
      </mesh>
      {/* a soft warm pool of light on the desk under the play position */}
      <mesh position={[0, -2.32, 0.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.4, 56]} />
        <meshBasicMaterial color="#ffb463" transparent opacity={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Drives the ONE continuous move: advances a progress toward the target (shelf=0,
// play=1) and lerps the camera + the device group between the two poses every frame.
function Rig({ target, deviceRef }: { target: number; deviceRef: React.RefObject<Group | null> }) {
  const raw = useRef(target); // snap to the initial mode (deep-links don't animate in)
  const tmp = useRef(new Vector3());
  useFrame((state, dt) => {
    const step = dt / DURATION;
    if (raw.current < target) raw.current = Math.min(target, raw.current + step);
    else if (raw.current > target) raw.current = Math.max(target, raw.current - step);
    const e = eased(raw.current);

    state.camera.position.lerpVectors(SHELF_CAM, PLAY_CAM, e);
    state.camera.lookAt(tmp.current.lerpVectors(SHELF_TGT, PLAY_TGT, e));

    const d = deviceRef.current;
    if (d) {
      d.position.lerpVectors(SHELF_POS, PLAY_POS, e);
      // arc FORWARD (toward the viewer) mid-float, so the device lifts off the shelf and
      // floats out + down onto the desk in a graceful curve instead of dropping through it.
      d.position.z += Math.sin(e * Math.PI) * 1.7;
      d.rotation.x = MathUtils.lerp(SHELF_TILT, PLAY_TILT, e);
      d.scale.setScalar(MathUtils.lerp(SHELF_SCALE, PLAY_SCALE, e));
    }
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
            <sphereGeometry args={[3.1, 16, 16]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
      <Rig target={target} deviceRef={deviceRef} />
    </Canvas>
  );
}
