import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import type { DeviceProps } from '../deviceProps';
import {
  BADGE,
  BODY,
  CAM_DIST,
  CAM_FOV,
  FRONT_Z,
  GRILLE,
  KEYBOARD,
  POWER,
  VIBRATO,
  keyCells,
} from './layout';
import { PALETTE, dim } from './palette';
import { SCRIPT_FONT } from './fonts';
import { makeKeyboardTexture } from './keyboardTexture';
import { makeGrilleTexture } from './grilleTexture';
import { Chassis } from './Chassis';
import { Key } from './Key';
import { Switch } from './Switch';
import { Stylus } from './Stylus';

// The modeled StyloClone, faithful to the black-and-silver Stylophone: a black slab with a silver
// slat grille + logo badge up top, a stylus channel, and a white lower strip holding the POWER +
// VIBRATO switches and the FLAT etched keyboard. Purely presentational.
export function Device({ vm, handlers }: DeviceProps) {
  const keyboardTex = useMemo(() => makeKeyboardTexture(), []);
  const grilleTex = useMemo(() => makeGrilleTexture(), []);
  const cells = useMemo(() => keyCells(), []);

  // Fit-scale to the viewport from the fixed app camera (shared convention with the HiClone).
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const visH = 2 * CAM_DIST * Math.tan((CAM_FOV * Math.PI) / 180 / 2);
  const visW = visH * aspect;
  const scale = Math.min(1, (visW * 0.94) / BODY.w, (visH * 0.94) / BODY.h);

  // map a normalized keyboard-panel coord (y up) into world space on the plate
  const kx = (nx: number) => KEYBOARD.x + (nx - 0.5) * KEYBOARD.w;
  const ky = (ny: number) => KEYBOARD.y + (ny - 0.5) * KEYBOARD.h;
  const plateZ = FRONT_Z + 0.04;

  const badgeText = vm.power ? PALETTE.badgeText : dim(PALETTE.badgeText, 0.4);

  return (
    <group scale={scale}>
      <Chassis power={vm.power} />

      {/* silver slat speaker grille (top) */}
      <mesh position={[GRILLE.x, GRILLE.y, FRONT_Z + 0.008]}>
        <planeGeometry args={[GRILLE.w, GRILLE.h]} />
        <meshStandardMaterial map={grilleTex} metalness={0.35} roughness={0.5} />
      </mesh>

      {/* the logo badge on the grille */}
      <group position={[BADGE.x, BADGE.y, FRONT_Z + 0.02]}>
        <RoundedBox args={[BADGE.w, BADGE.h, 0.05]} radius={0.06} smoothness={4}>
          <meshStandardMaterial color={PALETTE.badge} metalness={0.2} roughness={0.5} />
        </RoundedBox>
        <Text
          font={SCRIPT_FONT}
          position={[0, -0.02, 0.04]}
          fontSize={0.34}
          color={badgeText}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0}
        >
          {BADGE.text}
        </Text>
      </group>

      {/* the stylus + its channel */}
      <Stylus />

      {/* the flat etched keyboard plate (canvas texture) */}
      <mesh position={[KEYBOARD.x, KEYBOARD.y, FRONT_Z + 0.036]}>
        <planeGeometry args={[KEYBOARD.w, KEYBOARD.h]} />
        <meshStandardMaterial map={keyboardTex} metalness={0.12} roughness={0.6} />
      </mesh>

      {/* per-key hit planes + lit glow, mapped from the shared cell geometry */}
      {cells.map((c) => {
        const cx = kx(c.hit.x + c.hit.w / 2);
        const cy = ky(c.hit.y + c.hit.h / 2);
        return (
          <Key
            key={c.midi}
            midi={c.midi}
            xw={cx}
            yw={cy}
            ww={c.hit.w * KEYBOARD.w}
            hw={c.hit.h * KEYBOARD.h}
            z={plateZ}
            lit={vm.litKey === c.midi}
            power={vm.power}
            handlers={handlers}
          />
        );
      })}

      {/* POWER + VIBRATO switches on the white strip (the only faithful front controls) */}
      <Switch
        x={POWER.x}
        y={POWER.y}
        w={POWER.w}
        h={POWER.h}
        on={vm.power}
        power={true}
        label="POWER"
        offOn
        onToggle={handlers.onPower}
        resume={handlers.resume}
      />
      <Switch
        x={VIBRATO.x}
        y={VIBRATO.y}
        w={VIBRATO.w}
        h={VIBRATO.h}
        on={vm.vibrato}
        power={vm.power}
        label="VIBRATO"
        offOn
        onToggle={handlers.onVibratoToggle}
        resume={handlers.resume}
      />
    </group>
  );
}

export default Device;
