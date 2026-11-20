// Techno share card: HUD. Graph-paper grid, a hairline frame with corner brackets, monospace result behind a ">" prompt
// and a block cursor, "// tool" caption, bracket-style mark.

import type { ShareData, ShareSize, TokenSet } from "../../contract/model";
import { BRAND_NAME, SHARE_MONO, SHARE_FONT, drawFooterRow, drawMark, drawText, drawWrapped, fillAll, hexA, isRtlText } from "../share-kit";

/** Monospace stacks have no Arabic (or other non-Latin digit) glyphs: those texts use the proportional stack instead of a spaced fallback. */
const monoFor = (s: string): string => (/^[\x20-\x7e]*$/.test(s) ? SHARE_MONO : SHARE_FONT);

export function drawTechnoShareCard(ctx: CanvasRenderingContext2D, data: ShareData, size: ShareSize, tk: TokenSet): void {
  fillAll(ctx, size, tk.bg);
  // grid
  ctx.strokeStyle = hexA(tk.line, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= size.w; x += 36) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size.h);
  }
  for (let y = 0; y <= size.h; y += 36) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size.w, y + 0.5);
  }
  ctx.stroke();

  // content panel keeps the text off the grid lines
  const fx = 22;
  const fy = 22;
  const fw = size.w - 44;
  const fh = size.h - 44;
  ctx.fillStyle = hexA(tk.surface, 0.94);
  ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = tk.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);

  // HUD corner brackets
  ctx.strokeStyle = tk.accent;
  ctx.lineWidth = 3;
  ctx.lineCap = "square";
  const L = 34;
  const o = 14;
  const corners: ReadonlyArray<readonly [number, number, number, number]> = [
    [o, o, 1, 1],
    [size.w - o, o, -1, 1],
    [size.w - o, size.h - o, -1, -1],
    [o, size.h - o, 1, -1],
  ];
  ctx.beginPath();
  for (const [x, y, dx, dy] of corners) {
    ctx.moveTo(x + dx * L, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * L);
  }
  ctx.stroke();

  const left = 58;
  const right = size.w - 58;
  drawMark(ctx, left, 46, 44, { brackets: tk.accent, bars: tk.ink, bolt: tk.accent, barRadius: 0 });
  drawText(ctx, BRAND_NAME.toUpperCase(), { x: left + 58, y: 78, maxW: 200, size: 24, weight: 700, color: tk.ink, family: SHARE_MONO, dir: "ltr" });
  // the "//" prefix would land on the wrong side of right-to-left text, so only Latin/Cyrillic captions get it
  drawText(ctx, isRtlText(data.title) ? data.title : "// " + data.title, { x: right, y: 77, maxW: 250, size: 20, min: 14, weight: 500, color: tk.ink2, align: "right", family: monoFor(data.title) });

  drawText(ctx, ">", { x: left, y: 192, maxW: 40, size: 54, weight: 700, color: tk.accent, family: SHARE_MONO, dir: "ltr", baseline: "middle" });
  const mx = left + 44;
  const cursorW = 18;
  const m = drawText(ctx, data.main, { x: mx, y: 192, maxW: right - mx - cursorW - 10, size: 88, min: 18, weight: 700, color: tk.ink, family: monoFor(data.main), dir: "ltr", baseline: "middle" });
  ctx.fillStyle = tk.accent;
  ctx.fillRect(mx + m.width + 8, 192 - m.px * 0.36, cursorW, m.px * 0.72);

  drawWrapped(ctx, data.sub, { x: left, y: 270, maxW: right - left, size: 22, lineHeight: 30, maxLines: 2, color: tk.ink2, family: monoFor(data.sub), dir: "auto" });
  ctx.fillStyle = tk.line;
  ctx.fillRect(left, 328, right - left, 1);
  drawFooterRow(ctx, data, { left, right, y: 360, footerColor: tk.ink2, handleColor: tk.accent, family: monoFor(data.footer), footerSize: 18, handleSize: 20 });
}
