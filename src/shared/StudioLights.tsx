import { Environment, Lightformer } from '@react-three/drei';

// The shared studio lighting rig: cool directionals plus an emissive-panel
// Environment (NO CDN HDR - preset envs fetch remotely; these panels are local) so
// the milled-aluminium instruments have bright highlights to REFLECT. Without an env
// map a high-metalness surface reads as dead dark grey. Used by BOTH the play scene
// and the shelf so the metal reads identically in each.
export function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 6]} intensity={1.2} />
      <directionalLight position={[-4, -2, 3]} intensity={0.32} />
      {/* cool back rim, lifts the anodized edges off the dark backdrop */}
      <directionalLight position={[0, 3, -4]} intensity={0.4} color="#9fb4ff" />
      <Environment resolution={256}>
        <Lightformer position={[0, 6, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 5, 1]} intensity={5} color="#ffffff" />
        <Lightformer position={[0, 0, 8]} scale={[10, 10, 1]} intensity={0.7} color="#e8edff" />
        <Lightformer position={[-7, 1, 2]} rotation={[0, Math.PI / 2, 0]} scale={[5, 7, 1]} intensity={3.2} color="#cfe0ff" />
        <Lightformer position={[7, -1, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 7, 1]} intensity={2.6} color="#ffe6c4" />
      </Environment>
    </>
  );
}
