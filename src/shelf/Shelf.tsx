import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { useNavigate } from 'react-router-dom';
import { StudioLights } from '../shared/StudioLights';
import { INSTRUMENTS } from '../instruments/registry';
import type { InstrumentManifest } from '../shared/instrument';
import './Shelf.css';

// How far the instrument leans back on the shelf (radians); the bottom edge rests on
// the plank and the face tilts up toward the viewer, like a frame on a stand.
const PROP_TILT = 0.34;
// Where the camera dives to when you tap an instrument (close, head-on) before the
// route swaps to the play view - so it reads as flying INTO the device, not a hard cut.
const ZOOM_TO = new Vector3(0, -0.3, 4.2);
const ZOOM_LOOK = new Vector3(0, -0.4, 0);
const ZOOM_MS = 620; // matches the CSS fade; navigate fires at the end

// Warm "cozy room" wash layered over the studio rig: a soft amber lamp glow + a warm
// hemisphere fill, so the scene feels inviting while the device keeps its metallic
// sheen (which the studio panels provide).
function WarmLights() {
  return (
    <>
      <hemisphereLight args={['#ffdca8', '#3a2616', 0.55]} />
      <pointLight position={[-4, 4, 4]} intensity={28} distance={20} decay={2} color="#ffcf8a" />
      <pointLight position={[5, 1, 2]} intensity={10} distance={18} decay={2} color="#ffb877" />
    </>
  );
}

// The cozy room: a warm back wall and a wooden shelf the instrument rests on.
function Room() {
  return (
    <group>
      <mesh position={[0, 0, -3.2]}>
        <planeGeometry args={[40, 26]} />
        <meshStandardMaterial color="#4a3122" roughness={0.95} metalness={0} />
      </mesh>
      <group position={[0, -1.62, -0.55]}>
        <mesh>
          <boxGeometry args={[9.2, 0.42, 2.6]} />
          <meshStandardMaterial color="#6e4a2f" roughness={0.72} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.04, 1.305]}>
          <boxGeometry args={[9.2, 0.34, 0.04]} />
          <meshStandardMaterial color="#7e5636" roughness={0.6} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.215, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.7, 48]} />
          <meshBasicMaterial color="#ffb060" transparent opacity={0.14} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// The HiClone resting on the shelf, propped back at an angle, with an invisible tap
// target enveloping it. While `active` (the user tapped), it un-tilts to face-on as the
// camera dives in, so the prop -> play transition is continuous.
function Hero({
  manifest,
  onSelect,
  active,
}: {
  manifest: InstrumentManifest;
  onSelect: () => void;
  active: boolean;
}) {
  const Model = manifest.Shelf3D;
  const g = useRef<Group>(null);
  const stop = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();
  useFrame((_, dt) => {
    const m = g.current;
    if (!m) return;
    const target = active ? 0 : PROP_TILT;
    m.rotation.x += (target - m.rotation.x) * Math.min(1, dt * 5);
  });
  return (
    <group ref={g} position={[0, -0.62, -0.15]} rotation={[PROP_TILT, 0, 0]}>
      <group scale={0.84}>{Model ? <Model /> : null}</group>
      <mesh onPointerDown={stop} onClick={onSelect}>
        <sphereGeometry args={[3.1, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// While idle the scene tilts gently toward the pointer for life; frozen during the zoom.
function Parallax({ frozen, children }: { frozen: boolean; children: React.ReactNode }) {
  const g = useRef<Group>(null);
  useFrame((state) => {
    const m = g.current;
    if (!m || frozen) return;
    m.rotation.y += (state.pointer.x * 0.16 - m.rotation.y) * 0.05;
    m.rotation.x += (-state.pointer.y * 0.06 - m.rotation.x) * 0.05;
  });
  return <group ref={g}>{children}</group>;
}

// Dives the camera toward the instrument while zooming (ease-out lerp), so tapping
// reads as flying into the device. The route swap is timed separately (ZOOM_MS).
function CameraRig({ zooming }: { zooming: boolean }) {
  useFrame((state, dt) => {
    if (!zooming) return;
    state.camera.position.lerp(ZOOM_TO, Math.min(1, dt * 3.4));
    state.camera.lookAt(ZOOM_LOOK);
  });
  return null;
}

// The shelf: a cozy room with the instruments resting on a wooden shelf. `/` renders
// this; tapping an instrument dives the camera in, fades, then routes to /<id>. Text is
// HTML over the canvas (no in-scene font to fetch -> avoids the troika CDN stall on iOS).
export function Shelf() {
  const navigate = useNavigate();
  const hero = INSTRUMENTS[0];
  const [zooming, setZooming] = useState(false);

  // Warm each instrument's lazy chunk while the user is looking at the shelf, so the
  // zoom transition lands on a ready device instead of a "loading" flash.
  useEffect(() => {
    for (const m of INSTRUMENTS) m.preload?.();
  }, []);

  const open = (id: string) => {
    if (zooming) return;
    setZooming(true);
    window.setTimeout(() => navigate(`/${id}`), ZOOM_MS);
  };

  return (
    <div className={'shelf-stage' + (zooming ? ' is-zooming' : '')}>
      <Canvas camera={{ position: [0, -0.1, 8.8], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <WarmLights />
        <StudioLights />
        <Parallax frozen={zooming}>
          <Room />
          {hero && <Hero manifest={hero} active={zooming} onSelect={() => open(hero.id)} />}
        </Parallax>
        <CameraRig zooming={zooming} />
      </Canvas>

      <header className="shelf-title">jam<span>shelf</span></header>

      {hero && (
        <button className="shelf-caption" onClick={() => open(hero.id)}>
          <span className="shelf-name">{hero.name}</span>
          <span className="shelf-blurb">{hero.blurb}</span>
          <span className="shelf-play">tap to play ▸</span>
        </button>
      )}

      <footer className="shelf-foot">more instruments coming soon</footer>
      <div className="shelf-fade" />
    </div>
  );
}
