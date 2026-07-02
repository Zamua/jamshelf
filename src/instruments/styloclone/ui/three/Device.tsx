import { useThree, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import type { DeviceProps } from '../deviceProps';
import { TUNE_RANGE_CENTS } from '../../application/state';
import {
  BODY,
  BRAND,
  CAM_DIST,
  CAM_FOV,
  FRONT_Z,
  PLATE,
  POWER,
  SPEAKER,
  TAGLINE,
  TUNE,
  VIBRATO,
  VOLUME,
  keySpecs,
} from './layout';
import { PALETTE, dim } from './palette';
import { BRAND_FONT, LABEL_FONT } from './fonts';
import { Chassis } from './Chassis';
import { Key } from './Key';
import { Speaker } from './Speaker';
import { Switch } from './Switch';
import { Pot } from './Pot';
import { Stylus } from './Stylus';

// The voice selector: a small tile showing the current voice; tap to cycle (BUZZ/ROUND/REED).
const VOICE_TILE = { x: -1.9, y: 0.34, w: 0.8, h: 0.38 } as const;

// The modeled StyloClone, assembled in a landscape group. Purely presentational: renders the
// ViewModel and fires raw input through the handlers.
export function Device({ vm, handlers }: DeviceProps) {
  const keys = keySpecs();

  // Fit-scale to the viewport from the fixed app camera (shared convention with the HiClone).
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const visH = 2 * CAM_DIST * Math.tan((CAM_FOV * Math.PI) / 180 / 2);
  const visW = visH * aspect;
  const scale = Math.min(1, (visW * 0.94) / BODY.w, (visH * 0.94) / BODY.h);

  const ink = vm.power ? PALETTE.ink : dim(PALETTE.ink, 0.3);
  const red = vm.power ? PALETTE.red : PALETTE.redDim;

  const cycleVoice = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    handlers.resume();
    handlers.onVoiceCycle();
  };

  return (
    <group scale={scale}>
      <Chassis power={vm.power} />

      {/* the 20 keys on the silver plate */}
      {keys.map((spec) => (
        <Key
          key={spec.midi}
          spec={spec}
          lit={vm.litKey === spec.midi}
          power={vm.power}
          z={PLATE.z + PLATE.raise + 0.03}
          handlers={handlers}
        />
      ))}

      <Speaker x={SPEAKER.x} y={SPEAKER.y} r={SPEAKER.r} power={vm.power} />

      {/* wordmark + tagline */}
      <Text
        font={BRAND_FONT}
        position={[BRAND.x, BRAND.y, FRONT_Z + 0.01]}
        fontSize={0.36}
        color={red}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.01}
      >
        {BRAND.text}
      </Text>
      <Text
        font={LABEL_FONT}
        position={[TAGLINE.x, TAGLINE.y, FRONT_Z + 0.01]}
        fontSize={0.15}
        color={ink}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
      >
        {TAGLINE.text}
      </Text>

      {/* voice selector tile */}
      <group position={[VOICE_TILE.x, VOICE_TILE.y, FRONT_Z]}>
        <RoundedBox
          args={[VOICE_TILE.w, VOICE_TILE.h, 0.08]}
          radius={0.05}
          smoothness={3}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={cycleVoice}
          onPointerCancel={cycleVoice}
        >
          <meshStandardMaterial color={vm.power ? PALETTE.switchBody : dim(PALETTE.switchBody, 0.4)} metalness={0.3} roughness={0.6} />
        </RoundedBox>
        <Text
          font={LABEL_FONT}
          position={[0, 0, 0.06]}
          fontSize={0.16}
          color={vm.power ? PALETTE.bodyHi : dim(PALETTE.bodyHi, 0.3)}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.06}
        >
          {vm.voice}
        </Text>
        <Text
          font={LABEL_FONT}
          position={[0, -VOICE_TILE.h * 0.72, 0.02]}
          fontSize={0.12}
          color={ink}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.05}
        >
          sound
        </Text>
      </group>

      {/* controls row: vibrato switch, tune pot, volume pot, power switch */}
      <Switch
        x={VIBRATO.x}
        y={VIBRATO.y}
        w={VIBRATO.w}
        h={VIBRATO.h}
        on={vm.vibrato}
        power={vm.power}
        label="vibrato"
        onToggle={handlers.onVibratoToggle}
        resume={handlers.resume}
      />
      <Pot
        x={TUNE.x}
        y={TUNE.y}
        r={TUNE.r}
        value={(vm.tune + TUNE_RANGE_CENTS) / (TUNE_RANGE_CENTS * 2)}
        power={vm.power}
        label="tune"
        onChange={(v) => handlers.onTune(v * TUNE_RANGE_CENTS * 2 - TUNE_RANGE_CENTS)}
        resume={handlers.resume}
      />
      <Pot
        x={VOLUME.x}
        y={VOLUME.y}
        r={VOLUME.r}
        value={vm.volume}
        power={vm.power}
        label="volume"
        onChange={handlers.onVolume}
        resume={handlers.resume}
      />
      <Switch
        x={POWER.x}
        y={POWER.y}
        w={POWER.w}
        h={POWER.h}
        on={vm.power}
        power={true}
        label="power"
        onToggle={handlers.onPower}
        resume={handlers.resume}
      />

      <Stylus />
    </group>
  );
}

export default Device;
