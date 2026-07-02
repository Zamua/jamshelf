import { RoundedBox, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { DrumVoice } from '../../domain/sequencer';
import { FRONT_Z, VOICE_ROW } from './layout';
import { PALETTE, dim } from './palette';
import { LABEL_FONT } from './fonts';

interface VoiceButtonProps {
  voice: DrumVoice;
  label: string;
  x: number;
  selected: boolean;
  hasHits: boolean; // this voice has at least one active step (a subtle dot)
  power: boolean;
  onSelect: (v: DrumVoice) => void;
  resume: () => void;
}

// A voice-select button: pick which drum voice the 16 step buttons program. The selected one glows
// orange; others are dark. A tiny dot marks voices that already have hits programmed.
export function VoiceButton({ voice, label, x, selected, hasHits, power, onSelect, resume }: VoiceButtonProps) {
  const base = !power ? dim(PALETTE.panel, 0.4) : selected ? PALETTE.orange : PALETTE.panel;
  const ink = !power ? PALETTE.inkDim : selected ? '#201203' : PALETTE.ink;

  const tap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    onSelect(voice);
  };

  return (
    <group position={[x, VOICE_ROW.y, FRONT_Z]}>
      <RoundedBox
        args={[VOICE_ROW.w, VOICE_ROW.h, 0.08]}
        radius={0.04}
        smoothness={3}
        position={[0, 0, 0.04]}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={tap}
        onPointerCancel={tap}
      >
        <meshStandardMaterial color={base} metalness={0.1} roughness={0.55} emissive={selected && power ? PALETTE.orange : '#000'} emissiveIntensity={selected && power ? 0.25 : 0} />
      </RoundedBox>
      <Text
        font={LABEL_FONT}
        position={[0, 0, 0.09]}
        fontSize={0.12}
        color={ink}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.02}
      >
        {label}
      </Text>
      {/* programmed-hits dot */}
      {hasHits && !selected && (
        <mesh position={[VOICE_ROW.w * 0.34, VOICE_ROW.h * 0.3, 0.09]}>
          <circleGeometry args={[0.025, 12]} />
          <meshStandardMaterial color={PALETTE.orange} emissive={PALETTE.orange} emissiveIntensity={0.5} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
