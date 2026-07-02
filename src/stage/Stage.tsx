import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Group, Vector3, Quaternion, MathUtils, type Camera } from 'three';
import { StudioLights } from '../shared/StudioLights';
import { ShelfLabel } from './ShelfLabel';
import { centroid, type Placement } from '../rig/rigStore';

// The two ends of the one continuous move. progress 0 = resting on the shelf (a swipeable
// CAROUSEL: the centered instrument large + head-on, its neighbours smaller + pushed to the
// sides); progress 1 = the tapped instrument lying on the desk (flat, viewed top-down). The
// active device floats between its carousel slot and the desk while the camera swings overhead.

const SHELF_Y = 3.0;
const SHELF_Z = -0.35;
const SHELF_TILT = -0.3;

// Carousel layout: the centered device (offset 0) is large + head-on; each step to the side
// pushes the device out in x, shrinks it, drops + pushes it back, and yaws it to face inward.
const CAR_X_STEP = 1.7; // x per unit of carousel offset
const CAR_CENTER_SCALE = 0.6;
const CAR_SIDE_SCALE = 0.36;
const CAR_SIDE_DROP = 0.3; // y drop for a fully-side device
const CAR_SIDE_BACK = 0.5; // z push-back for a fully-side device
const CAR_SIDE_YAW = 0.55; // inward yaw (rad) for a fully-side device

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

// BUILD mode: the camera pulls BACK to show the whole shelf (all instruments in a row up high)
// AND a board/workbench below. Tapping a shelf instrument flies it down onto the board (into the
// rig); tapping a board instrument flies it back up. Instruments are propped upright throughout.
// BUILD (angled 3/4) frames the wall shelf up top AND the desk below (where picked instruments fly
// down to lie flat). Placed instruments use the flat scatter pose (shared with play); un-placed
// wait on the shelf.
const BUILD_CAM = new Vector3(0, 3.0, 13);
const BUILD_TGT = new Vector3(0, 0.35, 1.1);
const BUILD_UP = new Vector3(0, 1, 0);
const BUILD_DURATION = 0.9; // camera ease into/out of build
const BUILD_SHELF_SCALE = 0.3; // instruments waiting on the shelf
const BUILD_SPACING = 1.55; // x gap between shelf homes

// A device's home slot on the wall shelf (build mode), by its registry index (fixed, so removing
// one leaves its gap rather than reshuffling the others).
function buildHomePose(regIndex: number, total: number): ShelfPose {
  return { pos: new Vector3((regIndex - (total - 1) / 2) * BUILD_SPACING, SHELF_Y, SHELF_Z), tilt: SHELF_TILT, scale: BUILD_SHELF_SCALE, yaw: 0 };
}

// RIG play: instruments lie FLAT on the desk at scattered positions (like stickers). The camera
// (not the instruments) moves: a top-down ALL-VIEW showing the whole pile, or ZOOMED to one.
const RIG_DESK_Y = -2.12; // flat on the desk
const RIG_SCALE = 0.62;
const RIG_ALLVIEW_Y = 10.5; // camera height to see the whole scattered pile
const RIG_FOCUS_Y = 2.55; // camera height zoomed to one instrument (it fills the screen)
const RIG_CAM_EASE = 3.2; // how fast the camera glides between all-view / focus
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const FLAT_Q = new Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2); // lay the face up
const _yawQ = new Quaternion();

// Pose a device lying flat on the desk at a scattered placement (face up, spun by yaw about the
// world vertical). Set directly - the pile is fixed; only the camera animates.
function applyRigPose(device: Group, p: Placement): void {
  device.position.set(p.x, RIG_DESK_Y, p.z);
  _yawQ.setFromAxisAngle(AXIS_Y, p.yaw);
  device.quaternion.copy(_yawQ).multiply(FLAT_Q); // flat first, then yaw about world Y
  device.scale.setScalar(RIG_SCALE);
}

interface Spin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dragging: boolean;
}

// The live carousel position: `pos` is the fractional centered index (moves with the finger),
// `target` the integer it snaps to, `dragging` gates the snap ease.
export interface Carousel {
  pos: number;
  target: number;
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

interface ShelfPose {
  pos: Vector3;
  tilt: number;
  scale: number;
  yaw: number;
}

// The carousel shelf pose for a device at signed offset `o` from the centered slot.
function carouselPose(o: number): ShelfPose {
  const a = Math.min(Math.abs(o), 1); // side-ness, clamped (further devices stay fully "side")
  const s = Math.sign(o);
  return {
    pos: new Vector3(o * CAR_X_STEP, SHELF_Y - a * CAR_SIDE_DROP, SHELF_Z - a * CAR_SIDE_BACK),
    tilt: SHELF_TILT,
    scale: MathUtils.lerp(CAR_CENTER_SCALE, CAR_SIDE_SCALE, a),
    yaw: -s * a * CAR_SIDE_YAW,
  };
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
      <group position={[0, 1.9, -0.6]}>
        <mesh>
          <boxGeometry args={[13.5, 0.42, 2.5]} />
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
// user's drag rotation (applied only while inspecting). The carousel yaw fades out as it floats.
function applyDevicePose(device: Group, shelf: ShelfPose, fe: number, ie: number, spin: Spin, t1: Vector3): void {
  t1.lerpVectors(shelf.pos, PLAY_POS, fe).lerp(INSPECT_POS, ie);
  const out = 1 - ie;
  t1.y += Math.sin(Math.sqrt(fe) * Math.PI) * FLOAT_LIFT * out;
  t1.z += Math.sin(fe * Math.PI) * FLOAT_BOW * out;
  device.position.copy(t1);
  const baseTilt = MathUtils.lerp(MathUtils.lerp(shelf.tilt, PLAY_TILT, fe), INSPECT_TILT, ie);
  const yaw = shelf.yaw * (1 - fe) * (1 - ie); // inward carousel yaw, only while shelved
  device.rotation.set(baseTilt + spin.x * ie, yaw + spin.y * ie, 0);
  device.scale.setScalar(MathUtils.lerp(MathUtils.lerp(shelf.scale, PLAY_SCALE, fe), INSPECT_SCALE, ie));
}

function applyCameraPose(camera: Camera, fe: number, ie: number, be: number, t2: Vector3, tUp: Vector3, tgt: Vector3): void {
  t2.lerpVectors(SHELF_CAM, PLAY_CAM, fe).lerp(INSPECT_CAM, ie).lerp(BUILD_CAM, be);
  camera.position.copy(t2);
  camera.up.copy(tUp.lerpVectors(SHELF_UP, PLAY_UP, fe).lerp(INSPECT_UP, ie).lerp(BUILD_UP, be).normalize());
  tgt.lerpVectors(SHELF_TGT, PLAY_TGT, fe).lerp(INSPECT_TGT, ie).lerp(BUILD_TGT, be);
  camera.lookAt(tgt);
}

function advance(p: { current: number }, target: number, step: number): void {
  if (p.current < target) p.current = Math.min(target, p.current + step);
  else if (p.current > target) p.current = Math.max(target, p.current - step);
}

// Eases the carousel position toward its snap target when the finger is off (a soft settle).
function CarouselTick({ carouselRef }: { carouselRef: React.RefObject<Carousel> }) {
  useFrame((_, dt) => {
    const c = carouselRef.current;
    if (c.dragging) return;
    const k = Math.min(1, dt * 9);
    c.pos += (c.target - c.pos) * k;
    if (Math.abs(c.target - c.pos) < 1e-3) c.pos = c.target;
  });
  return null;
}

function CameraRig({
  floatTarget,
  inspectTarget,
  buildTarget,
  rigActive,
  rigCamRef,
}: {
  floatTarget: number;
  inspectTarget: number;
  buildTarget: number;
  rigActive: boolean;
  rigCamRef: React.RefObject<{ pos: Vector3; tgt: Vector3; up: Vector3 }>;
}) {
  const fRaw = useRef(floatTarget);
  const iRaw = useRef(inspectTarget);
  const bRaw = useRef(buildTarget);
  const t2 = useRef(new Vector3());
  const tUp = useRef(new Vector3());
  const tgt = useRef(new Vector3());
  const rigTgt = useRef(new Vector3()); // the camera's currently-looked-at point (eased) in rig mode
  const rigUp = useRef(new Vector3()); // the eased camera up (rolls to keep the focused device upright)
  const rigInit = useRef(false);
  const { camera } = useThree();
  useLayoutEffect(() => {
    applyCameraPose(camera, eased(fRaw.current), eased(iRaw.current), eased(bRaw.current), t2.current, tUp.current, tgt.current);
    camera.updateMatrixWorld();
  }, [camera]);
  useFrame((state, dt) => {
    if (rigActive) {
      const c = rigCamRef.current;
      const k = Math.min(1, dt * RIG_CAM_EASE);
      if (!rigInit.current) {
        // snap on entry so we don't sweep in from the shelf pose
        state.camera.position.copy(c.pos);
        rigTgt.current.copy(c.tgt);
        rigUp.current.copy(c.up);
        rigInit.current = true;
      } else {
        state.camera.position.lerp(c.pos, k);
        rigTgt.current.lerp(c.tgt, k);
        rigUp.current.lerp(c.up, k);
      }
      state.camera.up.copy(rigUp.current).normalize();
      state.camera.lookAt(rigTgt.current);
      return;
    }
    rigInit.current = false;
    advance(fRaw, floatTarget, dt / DURATION);
    advance(iRaw, inspectTarget, dt / INSPECT_DURATION);
    advance(bRaw, buildTarget, dt / BUILD_DURATION);
    applyCameraPose(state.camera, eased(fRaw.current), eased(iRaw.current), eased(bRaw.current), t2.current, tUp.current, tgt.current);
  });
  return null;
}

// One device: its own group + float/inspect progress. Its shelf pose is the LIVE carousel pose
// for its offset from the centered slot (read from carouselRef each frame, so a swipe slides it).
// Only the active device floats to the desk; the rest ride the carousel. A tap (small movement)
// reports up via onTap; a drag past threshold is a swipe (handled by StageHost) and NOT a tap.
function DeviceRig({
  index,
  node,
  floatTarget,
  inspectTarget,
  spinRef,
  carouselRef,
  interactiveShelf,
  buildPose,
  rigPose,
  onTap,
}: {
  index: number;
  node: ReactNode;
  floatTarget: number;
  inspectTarget: number;
  spinRef: React.RefObject<Spin>;
  carouselRef: React.RefObject<Carousel>;
  interactiveShelf: boolean;
  buildPose: ShelfPose | null; // in build mode, the device lerps to this (shelf home or board slot)
  rigPose: Placement | null; // in rig play, the device lies flat here (fixed; the camera moves)
  onTap: (index: number) => void;
}) {
  const ref = useRef<Group>(null);
  const fRaw = useRef(floatTarget);
  const iRaw = useRef(inspectTarget);
  const t1 = useRef(new Vector3());
  const down = useRef<{ x: number; y: number } | null>(null);
  const buildRef = useRef(buildPose);
  buildRef.current = buildPose;
  const rigRef = useRef(rigPose);
  rigRef.current = rigPose;

  // Build mode overrides the carousel pose (lerped, so a tapped device flies shelf <-> board).
  const cur = useRef<ShelfPose | null>(null);
  const pose = (): ShelfPose => {
    const target = buildRef.current ?? carouselPose(index - carouselRef.current.pos);
    if (!buildRef.current) {
      cur.current = null;
      return target;
    }
    // ease the build pose so add/remove flies smoothly
    if (!cur.current) cur.current = { pos: target.pos.clone(), tilt: target.tilt, scale: target.scale, yaw: target.yaw };
    const c = cur.current;
    const k = 0.12;
    c.pos.lerp(target.pos, k);
    c.tilt += (target.tilt - c.tilt) * k;
    c.scale += (target.scale - c.scale) * k;
    c.yaw += (target.yaw - c.yaw) * k;
    return c;
  };

  const applyPose = () => {
    if (!ref.current) return;
    if (rigRef.current) applyRigPose(ref.current, rigRef.current);
    else applyDevicePose(ref.current, pose(), eased(fRaw.current), eased(iRaw.current), spinRef.current, t1.current);
  };
  useLayoutEffect(() => {
    applyPose();
    ref.current?.updateMatrixWorld(true);
  });
  useFrame((_, dt) => {
    advance(fRaw, floatTarget, dt / DURATION);
    advance(iRaw, inspectTarget, dt / INSPECT_DURATION);
    stepSpin(spinRef.current, dt);
    applyPose();
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const d = down.current;
    down.current = null;
    if (!d) return;
    const moved = Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y);
    if (moved < 12) onTap(index); // a tap, not a swipe
  };

  return (
    <group ref={ref}>
      {node}
      {interactiveShelf && (
        <mesh onPointerDown={onDown} onPointerUp={onUp}>
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
  activeId: string | null; // null = shelf/all-view; in a rig, the FOCUSED (played) instrument
  centeredIndex: number; // which instrument the carousel label names
  inspect: boolean;
  build: boolean; // rig-BUILD (angled): shelf up top, placed instruments lying flat on the desk
  rigPlay: boolean; // rig-PLAY (top-down): only the placed instruments, camera zooms to the focused
  placements: Record<string, Placement> | null; // flat scatter for placed instruments (build + play)
  spinRef: React.RefObject<Spin>;
  carouselRef: React.RefObject<Carousel>;
  onDeviceTap: (index: number) => void;
  onPointerMissed: () => void;
}

// The ONE persistent canvas behind the whole app. On the shelf the instruments form a swipeable
// carousel; tapping the centered one floats it to the desk. Build mode zooms out to the shelf +
// board. Nothing remounts, so every move is continuous.
export function Stage({
  instruments,
  activeId,
  centeredIndex,
  inspect,
  build,
  rigPlay,
  placements,
  spinRef,
  carouselRef,
  onDeviceTap,
  onPointerMissed,
}: StageProps) {
  const camFloat = activeId && !rigPlay ? 1 : 0; // in rig play the camera is driven separately
  const camInspect = inspect ? 1 : 0;
  const camBuild = build ? 1 : 0;
  const centered = instruments[centeredIndex];

  // Rig-play camera: focus on the played instrument (top-down zoom, ROLLED so the device reads
  // upright despite its scattered yaw) or the all-view over the whole pile (fixed orientation).
  const rigCam = useRef<{ pos: Vector3; tgt: Vector3; up: Vector3 }>({ pos: new Vector3(), tgt: new Vector3(), up: PLAY_UP.clone() });
  if (rigPlay && placements) {
    const focus = activeId ? placements[activeId] : null;
    if (focus) {
      rigCam.current.pos.set(focus.x, RIG_FOCUS_Y, focus.z);
      rigCam.current.tgt.set(focus.x, RIG_DESK_Y, focus.z);
      // roll so the device's top edge is at the top of the screen (device top after flat+yaw is
      // (-sin yaw, 0, -cos yaw) in world; that becomes the camera's up for a straight-down view)
      rigCam.current.up.set(-Math.sin(focus.yaw), 0, -Math.cos(focus.yaw));
    } else {
      const c = centroid(placements);
      rigCam.current.pos.set(c.x, RIG_ALLVIEW_Y, c.z);
      rigCam.current.tgt.set(c.x, RIG_DESK_Y, c.z);
      rigCam.current.up.copy(PLAY_UP);
    }
  }

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

      {/* the carousel label names the centered instrument (only on the plain shelf) */}
      {activeId === null && !build && !rigPlay && centered && <ShelfLabel text={centered.label} />}

      {instruments.map((inst, i) => {
        const isActive = inst.id === activeId;
        const placed = !!placements && inst.id in placements;
        // in rig PLAY only the placed instruments are on the desk (the rest are hidden)
        if (rigPlay && !placed) return null;
        // placed instruments lie flat on the desk (build AND play); un-placed sit on the shelf (build)
        const rigPose = placed ? placements![inst.id] : null;
        const buildPose = build && !placed ? buildHomePose(i, instruments.length) : null;
        return (
          <DeviceRig
            key={inst.id}
            index={i}
            node={inst.node}
            floatTarget={isActive ? 1 : 0}
            inspectTarget={isActive && inspect && !rigPlay ? 1 : 0}
            spinRef={spinRef}
            carouselRef={carouselRef}
            interactiveShelf={activeId === null}
            buildPose={buildPose}
            rigPose={rigPose}
            onTap={onDeviceTap}
          />
        );
      })}

      <CarouselTick carouselRef={carouselRef} />
      <CameraRig floatTarget={camFloat} inspectTarget={camInspect} buildTarget={camBuild} rigActive={rigPlay} rigCamRef={rigCam} />
    </Canvas>
  );
}
