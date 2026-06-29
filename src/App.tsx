import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Lightformer } from '@react-three/drei';
import { useSynth } from './ui/hooks/useSynth';
import { Device } from './ui/three/Device';
import { BODY_THEMES } from './ui/three/palette';
import { Manual } from './ui/components/Manual';
import './App.css';

// Composition root: wires the synth (controller + Web Audio adapter via the
// hook) into the R3F scene and the 2D overlays. Entering inspect mode angles the
// camera so the 3D-ness reads immediately; exiting snaps back to the front view.
export default function App() {
  const { vm, handlers } = useSynth();
  const [manualOpen, setManualOpen] = useState(false);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);

  const deviceHandlers = useMemo(
    () => ({ ...handlers, onHelpToggle: () => setManualOpen((open) => !open) }),
    [handlers],
  );

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (vm.inspect) {
      // a raised 3/4 view, so depth is obvious the moment you hit "3D"
      c.setAzimuthalAngle(0.62);
      c.setPolarAngle(1.12);
      c.update();
    } else {
      c.reset(); // back to the saved head-on front view
    }
  }, [vm.inspect]);

  return (
    <div className="stage">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => deviceHandlers.onJoyEnd()}
        onCreated={({ gl }) => {
          // The iOS selection loupe / magnifier on a held or double-tapped canvas is
          // a wontfix Safari behaviour that CSS cannot suppress; the only reliable
          // fix is to preventDefault the raw touch events on the canvas itself. R3F
          // drives the device via Pointer Events, which fire independently of this,
          // so taps + drags still work. Scoped to the canvas so the HTML buttons are
          // unaffected.
          const kill = (e: Event) => e.preventDefault();
          gl.domElement.addEventListener('touchstart', kill, { passive: false });
          gl.domElement.addEventListener('touchmove', kill, { passive: false });
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 6]} intensity={1.2} />
        <directionalLight position={[-4, -2, 3]} intensity={0.32} />
        {/* cool back rim, lifts the anodized edges off the dark backdrop */}
        <directionalLight position={[0, 3, -4]} intensity={0.4} color="#9fb4ff" />
        {/* A bright studio environment (emissive panels, no CDN HDR) so the milled-
            aluminium surfaces have bright highlights to REFLECT - metal reads as dull
            dark grey without it. The big frontal + overhead panels are the sheen. */}
        <Environment resolution={256}>
          <Lightformer position={[0, 6, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 5, 1]} intensity={5} color="#ffffff" />
          <Lightformer position={[0, 0, 8]} scale={[10, 10, 1]} intensity={0.7} color="#e8edff" />
          <Lightformer position={[-7, 1, 2]} rotation={[0, Math.PI / 2, 0]} scale={[5, 7, 1]} intensity={3.2} color="#cfe0ff" />
          <Lightformer position={[7, -1, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 7, 1]} intensity={2.6} color="#ffe6c4" />
        </Environment>
        <Device vm={vm} handlers={deviceHandlers} />
        <OrbitControls
          ref={controls}
          enabled={vm.inspect}
          enablePan={false}
          minDistance={4.5}
          maxDistance={11}
        />
      </Canvas>

      {/* Meta controls, parked in the top-right corner so they clear the device. */}
      <div className="tools">
        <button
          className="tool-btn tool-swatch"
          onClick={deviceHandlers.onSwapColor}
          aria-label="Swap the device color"
          title={BODY_THEMES[vm.themeIndex % BODY_THEMES.length].name}
          style={{ background: BODY_THEMES[vm.themeIndex % BODY_THEMES.length].body }}
        />
        <button
          className={'tool-btn' + (manualOpen ? ' is-active' : '')}
          onClick={deviceHandlers.onHelpToggle}
          aria-label="Toggle the how-to-play guide"
          aria-pressed={manualOpen}
        >
          ?
        </button>
        <button
          className={'tool-btn' + (vm.inspect ? ' is-active' : '')}
          onClick={deviceHandlers.onInspectToggle}
          aria-label="Toggle 3D inspect"
          aria-pressed={vm.inspect}
        >
          {vm.inspect ? 'play' : '3D'}
        </button>
      </div>

      <Manual open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
