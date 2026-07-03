import { Shape } from 'three';
import { RoundedBox, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { TrackVM } from '../../application/state';
import { FRONT_Z, TRACK, trackX } from './layout';
import { PALETTE, ringColor, ringGlow, dim } from './palette';
import { LABEL_FONT } from './fonts';

// A right-pointing play triangle (drawn with geometry - the mono font lacks ▶/●). Built once.
const PLAY_TRI = (() => {
  const s = new Shape();
  s.moveTo(-0.5, 0.6);
  s.lineTo(0.62, 0);
  s.lineTo(-0.5, -0.6);
  s.closePath();
  return s;
})();

// One track channel: a calm EDIT button, a prominent fader, a stop, a centered number, and the big
// round LED-ring record/play button (the signature). Ring glows green playing / red recording /
// amber overdub / dark empty. Taps fire on onPointerUp (R3F onClick is dead on touch in this app).
export function TrackChannel({
  i,
  track,
  power,
  onButton,
  onStop,
  resume,
}: {
  i: number;
  track: TrackVM;
  power: boolean;
  onButton: (i: number) => void;
  onStop: (i: number) => void;
  resume: () => void;
}) {
  const cx = trackX(i);
  const ring = power ? ringColor(track.state) : PALETTE.ledOff;
  const glow = power ? ringGlow(track.state) : 0;
  const capY = TRACK.faderY - TRACK.faderH / 2 + track.level * TRACK.faderH;

  const press = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    onButton(i);
  };
  const stop = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onStop(i);
  };

  return (
    <group position={[cx, 0, 0]}>
      {/* EDIT button - calm: a dark cap with a green glyph (not a loud solid block) */}
      <RoundedBox args={[TRACK.editW, TRACK.editH, 0.05]} radius={0.035} smoothness={3} position={[TRACK.editXoff, TRACK.editY, FRONT_Z + 0.02]}>
        <meshStandardMaterial color={power ? PALETTE.editBg : dim(PALETTE.editBg, 0.4)} metalness={0.2} roughness={0.6} />
      </RoundedBox>
      <Text font={LABEL_FONT} position={[TRACK.editXoff, TRACK.editY, FRONT_Z + 0.055]} fontSize={0.066} color={power ? PALETTE.editInk : dim(PALETTE.editInk, 0.5)} anchorX="center" anchorY="middle" letterSpacing={0.03}>
        EDIT
      </Text>

      {/* fader: a recessed groove + a prominent light cap at the level position */}
      <RoundedBox args={[TRACK.faderW * 0.42, TRACK.faderH + 0.06, 0.05]} radius={0.02} smoothness={3} position={[TRACK.faderXoff, TRACK.faderY, FRONT_Z + 0.01]}>
        <meshStandardMaterial color={PALETTE.faderTrack} roughness={0.95} />
      </RoundedBox>
      <RoundedBox args={[TRACK.faderW, 0.12, 0.07]} radius={0.025} smoothness={3} position={[TRACK.faderXoff, capY, FRONT_Z + 0.045]}>
        <meshStandardMaterial color={power ? PALETTE.faderCap : dim(PALETTE.faderCap, 0.4)} metalness={0.2} roughness={0.45} />
      </RoundedBox>
      {/* a thin grip line across the cap */}
      <mesh position={[TRACK.faderXoff, capY, FRONT_Z + 0.085]}>
        <planeGeometry args={[TRACK.faderW * 0.8, 0.012]} />
        <meshBasicMaterial color="#6a6d72" toneMapped={false} />
      </mesh>

      {/* stop button */}
      <RoundedBox
        args={[TRACK.stopSize, TRACK.stopSize, 0.06]}
        radius={0.045}
        smoothness={3}
        position={[TRACK.stopXoff, TRACK.stopY, FRONT_Z + 0.02]}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <meshStandardMaterial color={power ? '#33363b' : '#26282c'} metalness={0.3} roughness={0.5} />
      </RoundedBox>
      <mesh position={[TRACK.stopXoff, TRACK.stopY, FRONT_Z + 0.055]}>
        <planeGeometry args={[0.088, 0.088]} />
        <meshBasicMaterial color={power ? '#cfd2d6' : '#6a6d72'} toneMapped={false} />
      </mesh>

      {/* track number (centered under the controls, over the button) */}
      <Text font={LABEL_FONT} position={[TRACK.numXoff, TRACK.numY, FRONT_Z + 0.02]} fontSize={0.26} color={power ? PALETTE.ink : PALETTE.inkDim} anchorX="center" anchorY="middle">
        {i + 1}
      </Text>

      {/* the big round LED-ring record/play button */}
      <group position={[0, TRACK.buttonY, FRONT_Z]}>
        <mesh position={[0, 0, 0.004]}>
          <circleGeometry args={[TRACK.buttonR * 1.02, 48]} />
          <meshStandardMaterial color="#0a0b0d" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <ringGeometry args={[TRACK.buttonR * 0.8, TRACK.buttonR, 56]} />
          <meshStandardMaterial color={ring} emissive={ring} emissiveIntensity={glow} toneMapped={false} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]} onPointerDown={(e) => e.stopPropagation()} onPointerUp={press} onPointerCancel={press}>
          <cylinderGeometry args={[TRACK.buttonR * 0.7, TRACK.buttonR * 0.72, 0.1, 44]} />
          <meshStandardMaterial color="#15171a" metalness={0.35} roughness={0.45} />
        </mesh>
        <mesh position={[-0.075, 0, 0.12]} scale={0.11}>
          <shapeGeometry args={[PLAY_TRI]} />
          <meshBasicMaterial color={power ? '#d0d3d7' : '#5a5d62'} toneMapped={false} />
        </mesh>
        <mesh position={[0.08, 0, 0.12]}>
          <circleGeometry args={[0.052, 20]} />
          <meshBasicMaterial color={power ? '#d0d3d7' : '#5a5d62'} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
