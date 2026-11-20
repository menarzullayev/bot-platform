// Fintech share card: flat. A bordered card (white / near-black) on a quiet grey ground, a solid accent stripe on the left
// edge, flat mark, no shadows and no gradients.

import type { ShareData, ShareSize, TokenSet } from "../../contract/model";
import { BRAND_NAME, drawFooterRow, drawMark, drawText, drawWrapped, fillAll, roundRectPath } from "../share-kit";

export function drawFintechShareCard(ctx: CanvasRenderingContext2D, data: ShareData, size: ShareSize, tk: TokenSet): void {
  fillAll(ctx, size, tk.surface);
  const cx = 20;
  const cy = 20;
  const cw = size.w - 40;
  const ch = size.h - 40;
  ctx.save();
  roundRectPath(ctx, cx, cy, cw, ch, 20);
  ctx.fillStyle = tk.bg;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = tk.accent;
  ctx.fillRect(cx, cy, 12, ch);
  ctx.restore();
  roundRectPath(ctx, cx + 1, cy + 1, cw - 2, ch - 2, 19);
  ctx.strokeStyle = tk.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  const left = 64;
  const right = size.w - 60;
  drawMark(ctx, left, 46, 44, { plate: tk.accent, plateRadius: 16, bars: tk.onAccent, bolt: tk.onAccent });
  drawText(ctx, BRAND_NAME, { x: left + 56, y: 78, maxW: 200, size: 26, weight: 700, color: tk.ink, dir: "ltr" });
  drawText(ctx, data.title, { x: right, y: 77, maxW: 260, size: 22, min: 16, weight: 500, color: tk.ink2, align: "right" });

  drawText(ctx, data.main, { x: left, y: 232, maxW: right - left, size: 104, min: 20, weight: 700, color: tk.ink, dir: "ltr" });
  drawWrapped(ctx, data.sub, { x: left, y: 282, maxW: right - left, size: 26, lineHeight: 32, maxLines: 2, color: tk.ink2, dir: "auto" });

  ctx.fillStyle = tk.line;
  ctx.fillRect(left, 334, right - left, 1);
  drawFooterRow(ctx, data, { left, right, y: 366, footerColor: tk.ink2, handleColor: tk.accent });
}
