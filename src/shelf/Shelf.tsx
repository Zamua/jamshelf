import { useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Group } from 'three';
import { useNavigate } from 'react-router-dom';
import { StudioLights } from '../shared/StudioLights';
import { INSTRUMENTS } from '../instruments/registry';
import type { InstrumentManifest } from '../shared/instrument';
import './Shelf.css';

// A low metal disc the instrument rests on, with a SOFT accent glow halo on top (a
// subtle puddle, not a harsh ring).
function Pedestal({ accent, dim = false }: { accent: string; dim?: boolean }) {
  return (
    <group>
      <mesh position={[0, -1.55, 0]}>
        <cylinderGeometry args={[1.85, 2.15, 0.5, 56]} />
        <meshStandardMaterial color={dim ? '#0e1118' : '#171b25'} metalness={0.65} roughness={0.4} />
      </mesh>
      <mesh position={[0, -1.29, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.78, 56]} />
        <meshBasicMaterial color={accent} transparent opacity={dim ? 0.05 : 0.16} toneMapped={false} />
      </mesh>
    </group>
  );
}

// A playable instrument on its pedestal: the 3D model + an invisible tap target that
// envelops it (so a tap anywhere on/near the instrument opens it, regardless of how it
// is rotated, and the model's own pads never intercept the tap).
function Hero({ manifest, onSelect }: { manifest: InstrumentManifest; onSelect: () => void }) {
  const Model = manifest.Shelf3D;
  const stop = (e: ThreeEvent<PointerEvent>) => e.stopPropagation();
  return (
    <group>
      <Pedestal accent={manifest.accent} />
      <group scale={0.82} position={[0, 0.15, 0]}>{Model ? <Model /> : null}</group>
      <mesh onPointerDown={stop} onClick={onSelect}>
        <sphereGeometry args={[3.2, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// A reserved, empty slot - implies the shelf has room to grow without dominating.
function EmptySlot({ x, z, accent }: { x: number; z: number; accent: string }) {
  return (
    <group position={[x, 0, z]} scale={0.8}>
      <Pedestal accent={accent} dim />
    </group>
  );
}

// The whole shelf scene tilts gently toward the pointer / touch for a little life.
function Parallax({ children }: { children: React.ReactNode }) {
  const g = useRef<Group>(null);
  useFrame((state) => {
    const m = g.current;
    if (!m) return;
    m.rotation.y += (state.pointer.x * 0.22 - m.rotation.y) * 0.05;
    m.rotation.x += (-state.pointer.y * 0.1 - m.rotation.x) * 0.05;
  });
  return <group ref={g}>{children}</group>;
}

// The shelf: a 3D display of the instruments. `/` renders this; tapping an instrument
// routes to /<id> to play it. Text (title + caption) is HTML over the canvas, so there
// is no in-scene font to fetch (avoids the troika CDN-font stall on iOS).
export function Shelf() {
  const navigate = useNavigate();
  const hero = INSTRUMENTS[0];

  return (
    <div className="shelf-stage">
      <Canvas camera={{ position: [0, 0.4, 8.6], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <StudioLights />
        <Parallax>
          {/* dark grounding floor */}
          <mesh position={[0, -2.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[60, 60]} />
            <meshStandardMaterial color="#0a0d14" metalness={0.2} roughness={0.8} />
          </mesh>
          <EmptySlot x={-5.4} z={-1.6} accent={hero.accent} />
          <EmptySlot x={5.4} z={-1.6} accent={hero.accent} />
          {hero && <Hero manifest={hero} onSelect={() => navigate(`/${hero.id}`)} />}
        </Parallax>
      </Canvas>

      <header className="shelf-title">jam<span>shelf</span></header>

      {hero && (
        <button className="shelf-caption" onClick={() => navigate(`/${hero.id}`)}>
          <span className="shelf-name">{hero.name}</span>
          <span className="shelf-blurb">{hero.blurb}</span>
          <span className="shelf-play">tap to play ▸</span>
        </button>
      )}

      <footer className="shelf-foot">more instruments coming soon</footer>
    </div>
  );
}
