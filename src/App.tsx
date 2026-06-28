import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useSynth } from './ui/hooks/useSynth';
import { Device } from './ui/three/Device';
import './App.css';

// Composition root: wires the synth (controller + Web Audio adapter via the
// hook) into the R3F scene. OrbitControls are enabled only in inspect mode.
export default function App() {
  const { vm, handlers } = useSynth();

  return (
    <div className="stage">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onPointerMissed={() => handlers.onJoyEnd()}
      >
        <color attach="background" args={['#0a0c12']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 6]} intensity={1.1} />
        <directionalLight position={[-4, -2, 3]} intensity={0.35} />
        <Device vm={vm} handlers={handlers} />
        <OrbitControls enabled={vm.inspect} enablePan={false} />
      </Canvas>

      {/* meta controls (help / inspect). The UI lane styles these + the manual. */}
      <div className="tools">
        <button onClick={handlers.onHelpToggle} aria-label="manual">?</button>
        <button onClick={handlers.onInspectToggle} aria-label="3D inspect">
          {vm.inspect ? 'play' : '3D'}
        </button>
      </div>
    </div>
  );
}
