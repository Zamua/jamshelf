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
// ShareTechMono advance width per character, in ems (used to keep the widest menu
// row inside the glass: font size is capped by both the row height AND this budget).
const MONO_ADVANCE = 0.62;
const ROW_BUDGET = 16; // chars the widest menu row must fit (">PATTERN UPDOWN" etc.)

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

// A fitted vertical menu: N evenly-spaced rows centered in the glass. The font size
// is the min of a per-row height fit and a horizontal char budget, so neither a tall
// menu (6-field KEY) nor a wide one (ARP's PATTERN row) clips. The cursor row (`>`)
// is bright amber; the rest are dim. A leading space on inactive rows keeps the mono
// columns aligned with the cursor.
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
  const n = rows.length;
  const usableH = gh * 0.84;
  const rowStep = usableH / n;
  const fontSize = Math.min(h * 0.16, rowStep * 0.64, gw / (ROW_BUDGET * MONO_ADVANCE));
  const top = ((n - 1) / 2) * rowStep; // y of the first row (block vertically centered)
  const leftPad = gw * 0.08;
  const activeColor = power ? PALETTE.amber : '#1c1f25';
  const dimColor = power ? '#8a5f28' : '#15181d';

  return (
    <>
      {rows.map((r, i) => (
        <Text
          key={r.label}
          font={OLED_FONT}
          position={[-gw / 2 + leftPad, top - i * rowStep, GLASS_Z]}
          fontSize={fontSize}
          color={r.active ? activeColor : dimColor}
          anchorX="left"
          anchorY="middle"
          letterSpacing={0.02}
        >
          {`${r.active ? '>' : ' '}${r.label} ${r.value}`}
        </Text>
      ))}
    </>
  );
}
