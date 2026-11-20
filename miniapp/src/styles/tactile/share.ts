// Tactile share card: a soft plate raised from the ground with the two-sided shadow of the keys, a pressed vermilion "="
// key in front of the result, the plate-style mark.

import type { ShareData, ShareSize, TokenSet } from "../../contract/model";
import { BRAND_NAME, drawFooterRow, drawMark, drawText, drawWrapped, fillAll, hexA, roundRectPath } from "../share-kit";
import { tactileShades } from "./tokens";

export function drawTactileShareCard(ctx: CanvasRenderingContext2D, data: ShareData, size: ShareSize, tk: TokenSet, dark: boolean): void {
  const sh = dark ? tactileShades.dark : tactileShades.light;
  fillAll(ctx, size, tk.bg);

  // the plate: dark shadow bottom-right, light shadow top-left, then the face
  const px = 28;
  const py = 28;
  const pw = size.w - 56;
  const ph = size.h - 56;
  for (const [color, off] of [
    [sh.lo, 10],
    [sh.hi, -10],
  ] as const) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.shadowOffsetX = off;
    ctx.shadowOffsetY = off;
    roundRectPath(ctx, px, py, pw, ph, 40);
    ctx.fillStyle = tk.surface;
    ctx.fill();
    ctx.restore();
  }
  roundRectPath(ctx, px, py, pw, ph, 40);
  ctx.fillStyle = tk.surface;
  ctx.fill();

  const left = 68;
  const right = size.w - 68;
  drawMark(ctx, left, 56, 52, {
    plate: [sh.keyHi, sh.keyLo],
    plateRadius: 20,
    shadow: [sh.lo, sh.hi, 5, 2.5],
    bars: tk.ink,
    bolt: tk.accent,
  });
  drawText(ctx, BRAND_NAME, { x: left + 66, y: 92, maxW: 200, size: 26, weight: 700, color: tk.ink, dir: "ltr" });
  drawText(ctx, data.title, { x: right, y: 90, maxW: 250, size: 22, min: 16, weight: 500, color: tk.ink2, align: "right" });

  // the "=" key, pressed: vermilion face, light bars
  const kx = left;
  const ky = 150;
  const ks = 78;
  ctx.save();
  ctx.shadowColor = hexA(sh.lo, 0.9);
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 5;
  roundRectPath(ctx, kx, ky, ks, ks, 26);
  ctx.fillStyle = tk.accent;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = tk.onAccent;
  roundRectPath(ctx, kx + 21, ky + 26, 36, 8, 4);
  ctx.fill();
  roundRectPath(ctx, kx + 21, ky + 44, 36, 8, 4);
  ctx.fill();

  const mx = kx + ks + 26;
  drawText(ctx, data.main, { x: mx, y: ky + ks / 2, maxW: right - mx, size: 92, min: 20, weight: 700, color: tk.ink, dir: "ltr", baseline: "middle" });
  drawWrapped(ctx, data.sub, { x: left, y: 276, maxW: right - left, size: 26, lineHeight: 32, maxLines: 2, color: tk.ink2, dir: "auto" });
  drawFooterRow(ctx, data, { left, right, y: 350, footerColor: tk.ink2, handleColor: tk.accent });
}
