import { CanvasTexture, SRGBColorSpace } from 'three';
import { keyCells } from './layout';
import { PALETTE } from './palette';

// Draws the FLAT etched Stylophone keyboard as a canvas texture: a white panel, a black key-bed
// inset, the tan key polygons (naturals AND sharps the same metal color - the black gaps between
// them are the etched lines), and the printed numbers (1..12 below the naturals, x.5 above the
// sharps). Static (drawn once); the pressed-key glow is a separate overlay mesh in the Device.
export function makeKeyboardTexture(): CanvasTexture {
  const W = 1024;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // normalized (y-up) -> canvas px (y-down)
  const px = (x: number) => x * W;
  const py = (y: number) => (1 - y) * H;

  // white panel background
  ctx.fillStyle = PALETTE.strip;
  ctx.fillRect(0, 0, W, H);

  // black key-bed, INSET into the white panel: a beveled rim (dark top / light bottom) + a soft
  // inner shadow at the top so the bed reads as recessed below the surface (matches the real device).
  const bedX = px(0.012);
  const bedTop = py(0.86);
  const bedBot = py(0.1);
  const bedW = px(0.976);
  const bedH = bedBot - bedTop;

  ctx.fillStyle = PALETTE.plate;
  roundRect(ctx, bedX, bedTop, bedW, bedH, 10);
  ctx.fill();

  // inner top shadow (recess catches shadow at the top lip)
  ctx.save();
  roundRect(ctx, bedX, bedTop, bedW, bedH, 10);
  ctx.clip();
  const inner = ctx.createLinearGradient(0, bedTop, 0, bedTop + bedH * 0.4);
  inner.addColorStop(0, 'rgba(0,0,0,0.55)');
  inner.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = inner;
  ctx.fillRect(bedX, bedTop, bedW, bedH * 0.4);
  ctx.restore();

  // beveled rim: dark at the top edge (shadow), light at the bottom edge (the lip catches light)
  const rim = ctx.createLinearGradient(0, bedTop, 0, bedBot);
  rim.addColorStop(0, 'rgba(0,0,0,0.4)');
  rim.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  rim.addColorStop(1, 'rgba(255,255,255,0.7)');
  ctx.lineWidth = 5;
  ctx.strokeStyle = rim;
  roundRect(ctx, bedX, bedTop, bedW, bedH, 10);
  ctx.stroke();

  const cells = keyCells();

  // the tan key polygons
  for (const c of cells) {
    ctx.beginPath();
    c.poly.forEach(([x, y], i) => {
      const X = px(x);
      const Y = py(y);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, bedTop, 0, bedBot);
    grad.addColorStop(0, PALETTE.keyHi);
    grad.addColorStop(1, PALETTE.key);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.keyEdge;
    ctx.stroke();
  }

  // the printed numbers, in the white margins
  ctx.fillStyle = PALETTE.keyNum;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of cells) {
    const cx = px(c.hit.x + c.hit.w / 2);
    if (c.kind === 'natural') {
      ctx.font = `600 ${Math.round(H * 0.1)}px system-ui, sans-serif`;
      ctx.fillText(c.label, cx, py(0.05));
    } else {
      ctx.font = `600 ${Math.round(H * 0.08)}px system-ui, sans-serif`;
      ctx.fillText(c.label, cx, py(0.93));
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
