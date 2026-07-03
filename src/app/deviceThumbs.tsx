import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bounds } from '@react-three/drei';
import { StudioLights } from '../shared/StudioLights';
import { Transport } from '../transport/transport';
import { INSTRUMENTS, instrumentById } from '../instruments/registry';
import type { AnyInstrumentModule } from '../shared/instrument';

// Device thumbnails, generated AT RUNTIME from the live 3D models (no committed assets, no build
// step): each device is rendered once into a hidden offscreen canvas and captured to a PNG data
// URL, cached for the session. Tweak a model or add an instrument and its thumbnail is simply
// regenerated on the next load - always in sync, zero manual work. The forge mounts on idle (before
// the drawer is ever opened, so there's no flash), renders each device once, then retires.

const cache = new Map<string, string>(); // instrument id -> PNG data URL

export function getDeviceThumb(id: string): string | undefined {
  return cache.get(id);
}

const CAPTURE_FRAME = 5; // give <Bounds> a couple frames to fit + the lights/env to settle first

// One device, front-lit, on a slight 3/4 tilt, auto-framed. useInstrument gives it a real (idle) VM;
// the audio graph is lazy so this creates NO AudioContext (verified).
function DeviceThumb({ module }: { module: AnyInstrumentModule }) {
  const transport = useMemo(() => new Transport(), []);
  const { vm, handlers } = module.useInstrument(false, transport);
  const Device = module.Device;
  return (
    <group rotation={[-0.32, 0.5, 0]}>
      <Device vm={vm} handlers={handlers} />
    </group>
  );
}

// Grabs the canvas pixels ONCE, a few frames in (capture-once so a doubled/skipped frame can't miss).
function Capture({ onCapture }: { onCapture: (url: string) => void }) {
  const { gl } = useThree();
  const n = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    n.current += 1;
    if (n.current >= CAPTURE_FRAME) {
      done.current = true;
      onCapture(gl.domElement.toDataURL('image/png'));
    }
  });
  return null;
}

// Renders every not-yet-cached device offscreen CONCURRENTLY (one small hidden canvas each), captures
// each independently, and retires the whole forge once all are cached (all canvases unmount -> no
// ongoing cost). onProgress fires per capture so the chips re-render as thumbnails arrive.
export function DeviceThumbForge({ onProgress }: { onProgress: () => void }) {
  const todo = useMemo(() => INSTRUMENTS.map((m) => m.manifest.id).filter((id) => !cache.has(id)), []);
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  if (todo.length === 0 || todo.every((id) => done.has(id))) return null;
  return (
    <div style={{ position: 'fixed', left: -9999, top: -9999, opacity: 0, pointerEvents: 'none' }} aria-hidden>
      {todo.map((id) => {
        if (done.has(id)) return null;
        const module = instrumentById(id);
        if (!module) return null;
        return (
          <div key={id} style={{ width: 128, height: 128 }}>
            <Canvas
              gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
              camera={{ position: [0, 0, 9], fov: 28 }}
            >
              <StudioLights />
              <Bounds fit clip margin={1.15}>
                <DeviceThumb module={module} />
              </Bounds>
              <Capture
                onCapture={(url) => {
                  cache.set(id, url);
                  onProgress();
                  setDone((prev) => new Set(prev).add(id));
                }}
              />
            </Canvas>
          </div>
        );
      })}
    </div>
  );
}
