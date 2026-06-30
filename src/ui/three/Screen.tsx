import { Text, RoundedBox } from '@react-three/drei';
import { PALETTE } from './palette';
import { WELL_DEPTH } from './layout';
import { OLED_FONT } from './font';
import type { MenuRow } from '../../application/state';

interface ScreenProps {
  big: string;
  small: string;
  menuRows: readonly MenuRow[];
  power: boolean;
  x: number;
  y: number;
  z: number; // the floor of the screen's recess (FLOOR_Z)
  w: number;
  h: number;
}

const GLASS_Z = WELL_DEPTH - 0.018;
// ShareTechMono advance width per character, in ems (used to shrink an over-long
// single row so it fits the glass width WITHOUT wrapping to a second line).
const MONO_ADVANCE = 0.6;

// The OLED: a black panel filling its square recess, with amber text on emissive
// glass set just below the face so it reads as a sunken display. In normal use the
// big line is the key/chord and the small line is patch+mode. When a menu is open,
// `menuRows` is rendered as a fitted vertical list (one field per row, the cursor
// row brighter) so adding fields never overflows the screen. Goes dark when off.
export function Screen({ big, small, menuRows, power, x, y, z, w, h }: ScreenProps) {
  const amberBig = power ? PALETTE.amber : '#1c1f25';
  const amberSmall = power ? '#d59433' : '#181b21';
  const gw = w - 0.12;
  const gh = h - 0.12;

  return (
    <group position={[x, y, z]}>
      {/* black backing in the lower part of the recess (its front sits BEHIND the
          glass so it never occludes the display) */}
      <RoundedBox
        args={[w, h, WELL_DEPTH - 0.04]}
        radius={0.05}
        smoothness={4}
        position={[0, 0, (WELL_DEPTH - 0.04) / 2]}
      >
        <meshStandardMaterial color="#05060a" metalness={0.3} roughness={0.6} />
      </RoundedBox>

      {/* emissive glass, recessed below the face but in front of the backing */}
      <mesh position={[0, 0, WELL_DEPTH - 0.025]}>
        <planeGeometry args={[gw, gh]} />
        <meshStandardMaterial
          color={PALETTE.oled}
          emissive={power ? '#0c1a44' : '#020306'}
          emissiveIntensity={power ? 0.45 : 0.05}
          metalness={0}
          roughness={0.2}
        />
      </mesh>

      {menuRows.length > 0 ? (
        <MenuList rows={menuRows} power={power} gw={gw} gh={gh} h={h} />
      ) : (
        <>
          <Text
            font={OLED_FONT}
            position={[0, gh * 0.2, GLASS_Z]}
            fontSize={h * 0.22}
            color={amberBig}
            anchorX="center"
            anchorY="middle"
            maxWidth={gw}
            lineHeight={1}
            letterSpacing={0.02}
          >
            {big}
          </Text>
          <Text
            font={OLED_FONT}
            position={[0, -gh * 0.32, GLASS_Z]}
            fontSize={h * 0.14}
            color={amberSmall}
            anchorX="center"
            anchorY="middle"
            maxWidth={gw}
            letterSpacing={0.02}
          >
            {small}
          </Text>
        </>
      )}
    </group>
  );
}

// A scrolling vertical menu at a fixed, readable row height. Rows are rendered at a
// constant pitch; only the ones that fit the glass are drawn (a window around the
// cursor), so a long menu (6-field KEY) never overflows - the off-screen rows are
// occluded by simply not rendering them, instead of bleeding over the bezel. An
// over-long single row (ARP's PATTERN value) shrinks just enough to stay on ONE line
// rather than wrapping. Tiny chevrons hint when there are more rows above / below.
function MenuList({
  rows,
  power,
  gw,
  gh,
  h,
}: {
  rows: readonly MenuRow[];
  power: boolean;
  gw: number;
  gh: number;
  h: number;
}) {
  const baseFont = h * 0.14; // readable; matches the pre-scroll OLED text size
  const lineStep = baseFont * 1.12; // tight enough to show 5 of the 6 KEY rows at once
  const usableW = gw * 0.88;
  const leftPad = gw * 0.06;
  const activeColor = power ? PALETTE.amber : '#1c1f25';
  const dimColor = power ? '#8a5f28' : '#15181d';

  const n = rows.length;
  const maxVisible = Math.max(1, Math.floor((gh * 0.96) / lineStep));
  const activeIndex = Math.max(0, rows.findIndex((r) => r.active));
  // Window the rows around the cursor so the active field is always on screen.
  let start = 0;
  if (n > maxVisible) {
    start = Math.min(Math.max(activeIndex - Math.floor(maxVisible / 2), 0), n - maxVisible);
  }
  const visible = rows.slice(start, start + maxVisible);
  const top = ((visible.length - 1) / 2) * lineStep; // center the window block
  const moreAbove = start > 0;
  const moreBelow = start + maxVisible < n;

  return (
    <>
      {visible.map((r, i) => {
        const text = `${r.active ? '>' : ' '}${r.label} ${r.value}`;
        // shrink an over-long row to keep it on one line (no wrap, no bleed)
        const fontSize = Math.min(baseFont, usableW / (text.length * MONO_ADVANCE));
        return (
          <Text
            key={r.label}
            font={OLED_FONT}
            position={[-gw / 2 + leftPad, top - i * lineStep, GLASS_Z]}
            fontSize={fontSize}
            color={r.active ? activeColor : dimColor}
            anchorX="left"
            anchorY="middle"
            letterSpacing={0.02}
          >
            {text}
          </Text>
        );
      })}
      {moreAbove && (
        <Text
          font={OLED_FONT}
          position={[gw * 0.4, gh * 0.46, GLASS_Z]}
          fontSize={baseFont * 0.5}
          color={dimColor}
          anchorX="center"
          anchorY="middle"
        >
          ▲
        </Text>
      )}
      {moreBelow && (
        <Text
          font={OLED_FONT}
          position={[gw * 0.4, -gh * 0.46, GLASS_Z]}
          fontSize={baseFont * 0.5}
          color={dimColor}
          anchorX="center"
          anchorY="middle"
        >
          ▼
        </Text>
      )}
    </>
  );
}
