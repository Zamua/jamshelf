import { useThree } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import type { DeviceProps } from '../deviceProps';
import {
  BODY,
  BODY_RADIUS,
  FRONT_Z,
  CAM_DIST,
  CAM_FOV,
  ACCENT_Y,
  PANEL_TOP,
  BRAND,
  SUBTITLE,
  OLED,
  KNOB_MIC,
  KNOB_IN,
  KNOB_OUT,
  KNOB_MEM,
  KNOB_OUTPUT,
  TRANSPORT,
  TRANSPORT_R,
  INPUT_FX,
  TRACK_FX,
  TRACKS,
  TRACK_SECTION,
} from './layout';
import { PALETTE, dim } from './palette';
import { BRAND_FONT, LABEL_FONT } from './fonts';
import { TrackChannel } from './TrackChannel';

// A panel knob: a small label above, a dark disc, an indicator line. Non-interactive in the drafts.
function Knob({ x, y, r, power, label }: { x: number; y: number; r: number; power: boolean; label: string }) {
  return (
    <group position={[x, y, FRONT_Z]}>
      <Text font={LABEL_FONT} position={[0, r + 0.075, 0.02]} fontSize={0.046} color={power ? PALETTE.inkDim : '#55575c'} anchorX="center" anchorY="middle" letterSpacing={0.04}>
        {label}
      </Text>
      <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r * 1.05, 0.12, 32]} />
        <meshStandardMaterial color={power ? PALETTE.knobBody : dim(PALETTE.knobBody, 0.3)} metalness={0.45} roughness={0.42} />
      </mesh>
      <mesh position={[0, r * 0.48, 0.09]}>
        <planeGeometry args={[Math.max(0.018, r * 0.12), r * 0.6]} />
        <meshBasicMaterial color={power ? PALETTE.ink : PALETTE.inkDim} toneMapped={false} />
      </mesh>
    </group>
  );
}

const TRANS_COLOR: Record<string, string> = { gray: PALETTE.transGray, red: PALETTE.transRed, green: PALETTE.transGreen };

// An FX section: a red label + three small recessed A/B/C buttons (one lit).
function FxCluster({ label, labelX, labelY, dotY, dotX, litIdx, on }: { label: string; labelX: number; labelY: number; dotY: number; dotX: readonly number[]; litIdx: number; on: boolean }) {
  return (
    <>
      <Text font={LABEL_FONT} position={[labelX, labelY, FRONT_Z + 0.01]} fontSize={0.055} color={on ? PALETTE.red : PALETTE.redDim} anchorX="center" anchorY="middle" letterSpacing={0.05}>
        {label}
      </Text>
      {dotX.map((dx, i) => {
        const lit = i === litIdx && on;
        return (
          <group key={i} position={[dx, dotY, FRONT_Z + 0.018]}>
            <mesh>
              <circleGeometry args={[0.064, 20]} />
              <meshStandardMaterial color="#0a0b0d" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0, 0.006]}>
              <circleGeometry args={[0.048, 20]} />
              <meshStandardMaterial color={on ? (lit ? PALETTE.fxRed : PALETTE.fxOff) : dim(PALETTE.fxOff, 0.4)} emissive={lit ? PALETTE.fxRed : '#000000'} emissiveIntensity={lit ? 0.9 : 0} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// The modeled LoopClone (v2): a wide near-black RC-505-style loop station. A dense, organized top
// panel - branding + a separated OLED + a knob cluster + colored/labeled transport + INPUT/TRACK FX
// - over five track channels with the signature big round LED-ring record/play buttons.
export function Device({ vm, handlers }: DeviceProps) {
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const visH = 2 * CAM_DIST * Math.tan((CAM_FOV * Math.PI) / 180 / 2);
  const visW = visH * aspect;
  const scale = Math.min(1, (visW * 0.94) / BODY.w, (visH * 0.94) / BODY.h);
  const on = vm.power;
  const loops = vm.tracks.filter((t) => t.state !== 'empty').length;

  return (
    <group scale={scale}>
      {/* body */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={BODY_RADIUS} smoothness={5}>
        <meshStandardMaterial color={on ? PALETTE.body : dim(PALETTE.body, 0.3)} metalness={0.3} roughness={0.45} />
      </RoundedBox>

      {/* top panel plate + red accent + divider */}
      <mesh position={[0, PANEL_TOP.y, FRONT_Z + 0.003]}>
        <planeGeometry args={[BODY.w - 0.3, PANEL_TOP.h]} />
        <meshStandardMaterial color={PALETTE.panel} metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, ACCENT_Y, FRONT_Z + 0.006]}>
        <planeGeometry args={[BODY.w - 0.3, 0.028]} />
        <meshBasicMaterial color={on ? PALETTE.red : PALETTE.redDim} toneMapped={false} />
      </mesh>

      {/* branding (top-left, clear of the OLED) */}
      <Text font={BRAND_FONT} position={[BRAND.x, BRAND.y, FRONT_Z + 0.01]} fontSize={BRAND.size} color={on ? PALETTE.red : PALETTE.redDim} anchorX="left" anchorY="middle" letterSpacing={0.01}>
        {BRAND.text}
      </Text>
      <Text font={LABEL_FONT} position={[SUBTITLE.x, SUBTITLE.y, FRONT_Z + 0.01]} fontSize={SUBTITLE.size} color={on ? PALETTE.ink : PALETTE.inkDim} anchorX="left" anchorY="middle" letterSpacing={0.14}>
        {SUBTITLE.text}
      </Text>

      {/* OLED (center) - a useful readout, NOT the name */}
      <mesh position={[OLED.x, OLED.y, FRONT_Z + 0.008]}>
        <planeGeometry args={[OLED.w, OLED.h]} />
        <meshBasicMaterial color={PALETTE.oledBg} toneMapped={false} />
      </mesh>
      <Text font={LABEL_FONT} position={[OLED.x, OLED.y + 0.085, FRONT_Z + 0.012]} fontSize={0.095} color={on ? PALETTE.oledInk : dim(PALETTE.oledInk, 0.5)} anchorX="center" anchorY="middle" letterSpacing={0.1}>
        {vm.playing ? 'PLAYING' : 'STOPPED'}
      </Text>
      <Text font={LABEL_FONT} position={[OLED.x, OLED.y - 0.08, FRONT_Z + 0.012]} fontSize={0.125} color={on ? dim(PALETTE.oledInk, 0.1) : dim(PALETTE.oledInk, 0.5)} anchorX="center" anchorY="middle" letterSpacing={0.05}>
        {loops} LOOP{loops === 1 ? '' : 'S'} · {vm.bpm}
      </Text>

      {/* knob cluster (labeled) */}
      <Knob x={KNOB_MIC.x} y={KNOB_MIC.y} r={KNOB_MIC.r} label={KNOB_MIC.label} power={on} />
      <Knob x={KNOB_IN.x} y={KNOB_IN.y} r={KNOB_IN.r} label={KNOB_IN.label} power={on} />
      <Knob x={KNOB_OUT.x} y={KNOB_OUT.y} r={KNOB_OUT.r} label={KNOB_OUT.label} power={on} />
      <Knob x={KNOB_MEM.x} y={KNOB_MEM.y} r={KNOB_MEM.r} label={KNOB_MEM.label} power={on} />
      <Knob x={KNOB_OUTPUT.x} y={KNOB_OUTPUT.y} r={KNOB_OUTPUT.r} label={KNOB_OUTPUT.label} power={on} />

      {/* transport row (colored buttons: a dark recess + a raised colored cap + a label below) */}
      {TRANSPORT.map((b) => {
        const lit = b.label === 'RUN' && vm.playing && on;
        const base = TRANS_COLOR[b.kind];
        return (
          <group key={b.label} position={[b.x, b.y, FRONT_Z]}>
            <mesh position={[0, 0, 0.014]}>
              <circleGeometry args={[TRANSPORT_R + 0.022, 28]} />
              <meshStandardMaterial color="#0a0b0d" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[TRANSPORT_R, TRANSPORT_R * 1.04, 0.06, 28]} />
              <meshStandardMaterial color={on ? base : dim(base, 0.4)} emissive={lit ? base : '#000000'} emissiveIntensity={lit ? 1.1 : 0} toneMapped={false} metalness={0.15} roughness={0.42} />
            </mesh>
            <Text font={LABEL_FONT} position={[0, -TRANSPORT_R - 0.078, 0.02]} fontSize={0.05} color={on ? PALETTE.inkDim : '#55575c'} anchorX="center" anchorY="middle" letterSpacing={0.02}>
              {b.label}
            </Text>
          </group>
        );
      })}

      {/* INPUT FX + TRACK FX clusters (label + three recessed A/B/C buttons) */}
      <FxCluster label="INPUT FX" labelX={INPUT_FX.labelX} labelY={INPUT_FX.labelY} dotY={INPUT_FX.dotY} dotX={INPUT_FX.dotX} litIdx={0} on={on} />
      <FxCluster label="TRACK FX" labelX={TRACK_FX.labelX} labelY={TRACK_FX.labelY} dotY={TRACK_FX.dotY} dotX={TRACK_FX.dotX} litIdx={1} on={on} />

      {/* track section plate */}
      <mesh position={[0, TRACK_SECTION.y, FRONT_Z + 0.002]}>
        <planeGeometry args={[BODY.w - 0.2, TRACK_SECTION.h]} />
        <meshStandardMaterial color="#0d0e11" metalness={0.15} roughness={0.8} />
      </mesh>

      {/* the 5 track channels */}
      {Array.from({ length: TRACKS }, (_, i) => (
        <TrackChannel key={i} i={i} track={vm.tracks[i]} power={on} onButton={handlers.onTrackButton} onStop={handlers.onTrackStop} resume={handlers.resume} />
      ))}
    </group>
  );
}

export default Device;
