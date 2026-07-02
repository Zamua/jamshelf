import { RoundedBox, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { FRONT_Z } from './layout';
import { PALETTE, dim } from './palette';
import { LABEL_FONT } from './fonts';

interface SwitchProps {
  x: number;
  y: number;
  w: number;
  h: number;
  on: boolean;
  power: boolean;
  label: string; // vertical side label (POWER / VIBRATO), Stylophone-style
  offOn?: boolean; // show OFF (top) / ON (bottom) marks (the power switch)
  onToggle: () => void;
  resume: () => void;
}

// A faithful vertical slide switch on the white strip. Silver nub in a dark track: DOWN = on, UP =
// off (matching the Stylophone's OFF-top/ON-bottom power slider). The label is set VERTICALLY to
// the left of the track (POWER / VIBRATO), like the real panel; the power switch also gets small
// OFF / ON marks above + below. Tapping anywhere toggles (onPointerUp; R3F onClick is dead on touch).
export function Switch({ x, y, w, h, on, power, label, offOn, onToggle, resume }: SwitchProps) {
  const nubY = on ? -h * 0.2 : h * 0.2;
  const nub = power ? PALETTE.switchNub : dim(PALETTE.switchNub, 0.4);
  const ink = power ? PALETTE.keyNum : dim(PALETTE.keyNum, 0.3);

  const tap = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    resume();
    onToggle();
  };

  return (
    // sit in FRONT of the white strip (its front face is ~FRONT_Z+0.03) so the track + labels
    // are not occluded by it
    <group position={[x, y, FRONT_Z + 0.04]}>
      {/* dark recessed track */}
      <RoundedBox args={[w, h, 0.05]} radius={0.04} smoothness={3} onPointerDown={(e) => e.stopPropagation()} onPointerUp={tap} onPointerCancel={tap}>
        <meshStandardMaterial color={PALETTE.switchTrack} metalness={0.3} roughness={0.6} />
      </RoundedBox>
      {/* the sliding silver nub */}
      <RoundedBox args={[w * 0.78, h * 0.44, 0.11]} radius={0.03} smoothness={3} position={[0, nubY, 0.05]}>
        <meshStandardMaterial color={nub} metalness={0.5} roughness={0.4} />
      </RoundedBox>
      {/* vertical side label to the RIGHT of the track (reads bottom-to-top), Stylophone-style */}
      <Text
        font={LABEL_FONT}
        position={[w * 0.5 + 0.11, 0, 0.02]}
        rotation={[0, 0, Math.PI / 2]}
        fontSize={0.092}
        color={ink}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.02}
      >
        {label}
      </Text>
      {/* OFF / ON marks hugging the power nub (kept inside the white strip) */}
      {offOn && (
        <>
          <Text font={LABEL_FONT} position={[0, h * 0.5 + 0.09, 0.02]} fontSize={0.078} color={ink} anchorX="center" anchorY="middle">
            OFF
          </Text>
          <Text font={LABEL_FONT} position={[0, -h * 0.5 - 0.09, 0.02]} fontSize={0.078} color={ink} anchorX="center" anchorY="middle">
            ON
          </Text>
        </>
      )}
    </group>
  );
}
