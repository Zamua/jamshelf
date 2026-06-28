import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSynth } from './ui/hooks/useSynth';
import { Device } from './ui/three/Device';
import { Manual } from './ui/components/Manual';
import { KeyMenuHint } from './ui/components/KeyMenuHint';
import './App.css';

// Composition root: wires the synth (controller + Web Audio adapter via the
// hook) into the R3F scene and the 2D overlays. The manual's open/closed state
// is UI-local React state owned here; we override the hook's no-op help handler
// so both the toolbar "?" and any in-device help affordance toggle the guide.
export default function App() {
  const { vm, handlers } = useSynth();
  const [manualOpen, setManualOpen] = useState(false);

  const deviceHandlers = useMemo(
    () => ({ ...handlers, onHelpToggle: () => setManualOpen((open) => !open) }),
    [handlers],
  );

  return (
    <div className="stage">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onPointerMissed={() => deviceHandlers.onJoyEnd()}
      >
        <color attach="background" args={['#0a0c12']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 6]} intensity={1.1} />
        <directionalLight position={[-4, -2, 3]} intensity={0.35} />
        <Device vm={vm} handlers={deviceHandlers} />
        <OrbitControls enabled={vm.inspect} enablePan={false} />
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
