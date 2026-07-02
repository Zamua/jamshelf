import { CanvasTexture, SRGBColorSpace } from 'three';
import { PALETTE } from './palette';

// Draws the Stylophone's speaker grille as a canvas texture: rows of short silver slats (a
// brick-like dash pattern) on a black background, matching the reissue's ribbed grille. A hole
// is left clear (transparent-ish dark) where the logo badge sits, drawn by the Device on top.
export function makeGrilleTexture(): CanvasTexture {
  const W = 1024;
  const H = 340;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = PALETTE.grilleDark;
  ctx.fillRect(0, 0, W, H);

  const rows = 17;
  const rowH = H / rows;
  const slatH = rowH * 0.52;
  const dash = 34; // slat segment length
  const dgap = 7; // gap between segments in a row
  for (let r = 0; r < rows; r++) {
    const cy = r * rowH + rowH * 0.5;
    const offset = (r % 2) * ((dash + dgap) / 2); // brick-stagger alternate rows
    for (let x = -offset; x < W; x += dash + dgap) {
      const grad = ctx.createLinearGradient(0, cy - slatH / 2, 0, cy + slatH / 2);
      grad.addColorStop(0, PALETTE.slatHi);
      grad.addColorStop(1, PALETTE.slat);
      ctx.fillStyle = grad;
      roundRect(ctx, x, cy - slatH / 2, dash, slatH, slatH * 0.35);
      ctx.fill();
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
