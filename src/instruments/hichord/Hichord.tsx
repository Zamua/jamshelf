import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSynth } from './ui/hooks/useSynth';
import { Device } from './ui/three/Device';
import { BODY_THEMES } from './ui/three/palette';
import { Manual } from './ui/components/Manual';
import { StudioLights } from '../../shared/StudioLights';
import './Hichord.css';

// The HiClone instrument: wires the synth (controller + Web Audio adapter via the
// hook) into the R3F scene and the 2D overlays. Entering inspect mode angles the
// camera so the 3D-ness reads immediately; exiting snaps back to the front view.
// Mounted by the router at /hichord (lazy-loaded via the instrument manifest).
export default function Hichord() {
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
        <StudioLights />
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
