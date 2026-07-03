import { useThree } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import type { DeviceProps } from '../deviceProps';
import {
  BODY,
  BODY_RADIUS,
  FRONT_Z,
  CAM_DIST,
  CAM_FOV,
  BRAND,
  SUBTITLE,
  OLED,
  KNOB_L,
  KNOB_R,
  ACCENT_Y,
  PANEL_TOP,
  TRACKS,
  TRACK_SECTION,
  TRANSPORT,
  TRANSPORT_BTNS,
  transportX,
} from './layout';
import { PALETTE, dim } from './palette';
import { BRAND_FONT, LABEL_FONT } from './fonts';
import { TrackChannel } from './TrackChannel';

// A simple visual knob (a dark disc + an indicator line). Non-interactive in the first draft.
function VisualKnob({ x, y, r, power }: { x: number; y: number; r: number; power: boolean }) {
  return (
    <group position={[x, y, FRONT_Z]}>
      <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r * 1.03, 0.14, 40]} />
        <meshStandardMaterial color={power ? '#282a2e' : '#1c1e21'} metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh position={[0, r * 0.5, 0.1]}>
        <planeGeometry args={[0.03, r * 0.55]} />
        <meshBasicMaterial color={power ? PALETTE.ink : PALETTE.inkDim} toneMapped={false} />
      </mesh>
    </group>
  );
}

// The modeled LoopClone: a wide near-black RC-505-style loop station. Top control panel (branding,
// OLED, two big knobs, a transport row) over five track channels with the signature big round
// LED-ring record/play buttons. Purely presentational - renders the ViewModel, fires raw input.
export function Device({ vm, handlers }: DeviceProps) {
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const visH = 2 * CAM_DIST * Math.tan((CAM_FOV * Math.PI) / 180 / 2);
  const visW = visH * aspect;
  const scale = Math.min(1, (visW * 0.94) / BODY.w, (visH * 0.94) / BODY.h);
  const on = vm.power;

  return (
    <group scale={scale}>
      {/* body */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={BODY_RADIUS} smoothness={5}>
        <meshStandardMaterial color={on ? PALETTE.body : dim(PALETTE.body, 0.3)} metalness={0.3} roughness={0.45} />
      </RoundedBox>

      {/* top panel plate (recessed) */}
      <mesh position={[0, PANEL_TOP.y, FRONT_Z + 0.003]}>
        <planeGeometry args={[BODY.w - 0.3, PANEL_TOP.h]} />
        <meshStandardMaterial color={PALETTE.panel} metalness={0.2} roughness={0.7} />
      </mesh>
      {/* red accent stripe near the top */}
      <mesh position={[0, ACCENT_Y, FRONT_Z + 0.006]}>
        <planeGeometry args={[BODY.w - 0.3, 0.03]} />
        <meshBasicMaterial color={on ? PALETTE.red : PALETTE.redDim} toneMapped={false} />
      </mesh>

      {/* branding */}
      <Text font={BRAND_FONT} position={[BRAND.x, BRAND.y, FRONT_Z + 0.01]} fontSize={0.34} color={on ? PALETTE.red : PALETTE.redDim} anchorX="left" anchorY="middle" letterSpacing={0.01}>
        {BRAND.text}
      </Text>
      <Text font={LABEL_FONT} position={[SUBTITLE.x, SUBTITLE.y, FRONT_Z + 0.01]} fontSize={0.13} color={on ? PALETTE.ink : PALETTE.inkDim} anchorX="left" anchorY="middle" letterSpacing={0.16}>
        {SUBTITLE.text}
      </Text>

      {/* OLED */}
      <mesh position={[OLED.x, OLED.y, FRONT_Z + 0.008]}>
        <planeGeometry args={[OLED.w, OLED.h]} />
        <meshBasicMaterial color={PALETTE.oledBg} toneMapped={false} />
      </mesh>
      <Text font={LABEL_FONT} position={[OLED.x, OLED.y + 0.075, FRONT_Z + 0.012]} fontSize={0.11} color={on ? PALETTE.oledInk : dim(PALETTE.oledInk, 0.5)} anchorX="center" anchorY="middle" letterSpacing={0.05}>
        LoopClone
      </Text>
      <Text font={LABEL_FONT} position={[OLED.x, OLED.y - 0.08, FRONT_Z + 0.012]} fontSize={0.088} color={on ? dim(PALETTE.oledInk, 0.2) : dim(PALETTE.oledInk, 0.55)} anchorX="center" anchorY="middle" letterSpacing={0.06}>
        {vm.playing ? `${vm.bpm} BPM` : 'READY'}
      </Text>

      {/* two big knobs */}
      <VisualKnob x={KNOB_L.x} y={KNOB_L.y} r={KNOB_L.r} power={on} />
      <VisualKnob x={KNOB_R.x} y={KNOB_R.y} r={KNOB_R.r} power={on} />

      {/* transport row (visual round buttons; RUN lights green while the transport is playing) */}
      {TRANSPORT_BTNS.map((label, i) => {
        const lit = i === TRANSPORT_BTNS.length - 1 && vm.playing && on;
        return (
          <mesh key={label} position={[transportX(i, TRANSPORT_BTNS.length), TRANSPORT.y, FRONT_Z + 0.02]}>
            <circleGeometry args={[TRANSPORT.r, 28]} />
            <meshStandardMaterial color={lit ? PALETTE.ledGreen : '#31343a'} emissive={lit ? PALETTE.ledGreen : '#000000'} emissiveIntensity={lit ? 0.9 : 0} toneMapped={false} metalness={0.2} roughness={0.5} />
          </mesh>
        );
      })}

      {/* track section plate (recessed, darker) */}
      <mesh position={[0, TRACK_SECTION.y, FRONT_Z + 0.002]}>
        <planeGeometry args={[BODY.w - 0.2, TRACK_SECTION.h]} />
        <meshStandardMaterial color="#0f1013" metalness={0.15} roughness={0.8} />
      </mesh>

      {/* the 5 track channels */}
      {Array.from({ length: TRACKS }, (_, i) => (
        <TrackChannel key={i} i={i} track={vm.tracks[i]} power={on} onButton={handlers.onTrackButton} onStop={handlers.onTrackStop} resume={handlers.resume} />
      ))}
    </group>
  );
}

export default Device;
