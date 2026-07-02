import { useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import type { DeviceProps } from '../deviceProps';
import { VOICES, VOICE_LABEL, type DrumVoice } from '../../domain/sequencer';
import { BODY, BODY_RADIUS, BRAND, CAM_DIST, CAM_FOV, FRONT_Z, PLAY, SUBTITLE, TEMPO, stepX, voiceX } from './layout';
import { PALETTE, dim, stepColor } from './palette';
import { BRAND_FONT, LABEL_FONT } from './fonts';
import { StepButton } from './StepButton';
import { VoiceButton } from './VoiceButton';
import { Knob } from './Knob';

// short button labels for the voice row
const SHORT: Record<DrumVoice, string> = { BD: 'BD', SD: 'SD', LT: 'TOM', CP: 'CLAP', CH: 'CH', OH: 'OH', CB: 'CB', CY: 'CY' };

// The modeled TR-B0B: a wide charcoal 808-style box with the TEMPO knob + START/STOP on the left,
// branding top-right, a voice-select row, and the iconic 16 colored step buttons. Presentational.
export function Device({ vm, handlers }: DeviceProps) {
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const visH = 2 * CAM_DIST * Math.tan((CAM_FOV * Math.PI) / 180 / 2);
  const visW = visH * aspect;
  const scale = Math.min(1, (visW * 0.94) / BODY.w, (visH * 0.94) / BODY.h);

  const row = vm.pattern[vm.selected];
  const playColor = vm.playing ? '#e0453a' : '#4a4d52';

  const play = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.resume();
    handlers.onPlayStop();
  };

  return (
    <group scale={scale}>
      {/* body */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={BODY_RADIUS} smoothness={5}>
        <meshStandardMaterial color={vm.power ? PALETTE.body : dim(PALETTE.body, 0.3)} metalness={0.25} roughness={0.5} />
      </RoundedBox>

      {/* a recessed panel behind the step row (the 808's lower section) */}
      <mesh position={[0.5, -0.95, FRONT_Z + 0.004]}>
        <planeGeometry args={[4.35, 1.15]} />
        <meshStandardMaterial color={PALETTE.panel} metalness={0.15} roughness={0.7} />
      </mesh>
      {/* orange accent line under the branding */}
      <mesh position={[0.5, 0.72, FRONT_Z + 0.004]}>
        <planeGeometry args={[4.35, 0.014]} />
        <meshBasicMaterial color={vm.power ? PALETTE.orange : PALETTE.orangeDim} toneMapped={false} />
      </mesh>

      {/* branding */}
      <Text font={BRAND_FONT} position={[BRAND.x, BRAND.y, FRONT_Z + 0.01]} fontSize={0.4} color={vm.power ? PALETTE.orange : PALETTE.orangeDim} anchorX="center" anchorY="middle" letterSpacing={0.02}>
        {BRAND.text}
      </Text>
      <Text font={LABEL_FONT} position={[SUBTITLE.x, SUBTITLE.y, FRONT_Z + 0.01]} fontSize={0.15} color={vm.power ? PALETTE.ink : PALETTE.inkDim} anchorX="center" anchorY="middle" letterSpacing={0.14}>
        {SUBTITLE.text}
      </Text>

      {/* tempo knob */}
      <Knob x={TEMPO.x} y={TEMPO.y} r={TEMPO.r} bpm={vm.bpm} power={vm.power} onTempo={handlers.onTempo} resume={handlers.resume} />

      {/* START / STOP */}
      <group position={[PLAY.x, PLAY.y, FRONT_Z]}>
        <RoundedBox args={[PLAY.w, PLAY.h, 0.1]} radius={0.05} smoothness={4} position={[0, 0, 0.05]} onPointerDown={(e) => e.stopPropagation()} onPointerUp={play} onPointerCancel={play}>
          <meshStandardMaterial color={vm.power ? PALETTE.cream : dim(PALETTE.cream, 0.4)} metalness={0.1} roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, PLAY.h * 0.22, 0.11]}>
          <circleGeometry args={[0.04, 16]} />
          <meshStandardMaterial color={playColor} emissive={playColor} emissiveIntensity={vm.playing && vm.power ? 1.2 : 0.1} toneMapped={false} />
        </mesh>
        <Text font={LABEL_FONT} position={[0, -PLAY.h * 0.12, 0.11]} fontSize={0.12} color="#2a1c0c" anchorX="center" anchorY="middle" letterSpacing={0.04}>
          {vm.playing ? 'STOP' : 'START'}
        </Text>
      </group>

      {/* voice-select row */}
      {VOICES.map((v, i) => (
        <VoiceButton
          key={v}
          voice={v}
          label={SHORT[v]}
          x={voiceX(i)}
          selected={vm.selected === v}
          hasHits={vm.pattern[v].some(Boolean)}
          power={vm.power}
          onSelect={handlers.onVoiceSelect}
          resume={handlers.resume}
        />
      ))}
      {/* selected voice name, above the step row */}
      <Text font={LABEL_FONT} position={[0.5, -0.28, FRONT_Z + 0.01]} fontSize={0.15} color={vm.power ? PALETTE.orange : PALETTE.orangeDim} anchorX="center" anchorY="middle" letterSpacing={0.08}>
        {VOICE_LABEL[vm.selected]}
      </Text>

      {/* 16 step buttons */}
      {row.map((on, i) => (
        <StepButton
          key={i}
          index={i}
          x={stepX(i)}
          color={stepColor(i)}
          active={on}
          playhead={vm.playing && vm.currentStep === i}
          power={vm.power}
          onToggle={handlers.onStepToggle}
          resume={handlers.resume}
        />
      ))}
    </group>
  );
}

export default Device;
