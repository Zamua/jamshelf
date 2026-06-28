import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSynth } from './ui/hooks/useSynth';
import { Device } from './ui/three/Device';
import { Manual } from './ui/components/Manual';
import { KeyMenuHint } from './ui/components/KeyMenuHint';
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
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[3, 5, 6]} intensity={1.15} />
        <directionalLight position={[-4, -2, 3]} intensity={0.35} />
        {/* cool back rim, lifts the anodized edges off the dark backdrop */}
        <directionalLight position={[0, 3, -4]} intensity={0.4} color="#9fb4ff" />
        <Device vm={vm} handlers={deviceHandlers} />
        <OrbitControls
          ref={controls}
          enabled={vm.inspect}
          enablePan={false}
          minDistance={4.5}
          maxDistance={11}
        />
      </Canvas>

      {/* Appears only while the gray key menu is open. */}
      <KeyMenuHint vm={vm} />

      {/* Meta controls, parked in the top-right corner so they clear the device. */}
      <div className="tools">
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
