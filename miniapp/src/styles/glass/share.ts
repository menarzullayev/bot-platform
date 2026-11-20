// Glass share card: the mesh gradient ground of the app, one translucent panel with a bright edge and a soft top
// highlight, the gradient (accent -> accent-2) mark and a pill for the tool name.

import type { ShareData, ShareSize, TokenSet } from "../../contract/model";
import { BRAND_NAME, SHARE_FONT, drawFooterRow, drawMark, drawText, drawWrapped, fillAll, hexA, roundRectPath } from "../share-kit";
import { glassAccent2, glassRecipe } from "./tokens";

export function drawGlassShareCard(ctx: CanvasRenderingContext2D, data: ShareData, size: ShareSize, tk: TokenSet, dark: boolean): void {
  const rec = dark ? glassRecipe.dark : glassRecipe.light;
  fillAll(ctx, size, tk.bg);
  // mesh: one soft radial glow in each corner
  const spots: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [size.w, 0],
    [size.w, size.h],
    [0, size.h],
  ];
  rec.mesh.forEach((c, i) => {
    const [x, y] = spots[i];
    const g = ctx.createRadialGradient(x, y, 0, x, y, 460);
    g.addColorStop(0, hexA(c, 1));
    g.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size.w, size.h);
  });

  // the panel
  const px = 32;
  const py = 32;
  const pw = size.w - 64;
  const ph = size.h - 64;
  roundRectPath(ctx, px, py, pw, ph, 36);
  ctx.fillStyle = hexA(rec.scrim, rec.alpha.surface);
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, px, py, pw, ph, 36);
  ctx.clip();
  const hl = ctx.createLinearGradient(0, py, 0, py + 140);
  hl.addColorStop(0, hexA("#ffffff", dark ? 0.1 : 0.4));
  hl.addColorStop(1, hexA("#ffffff", 0));
  ctx.fillStyle = hl;
  ctx.fillRect(px, py, pw, 140);
  ctx.restore();
  roundRectPath(ctx, px + 1, py + 1, pw - 2, ph - 2, 35);
  ctx.strokeStyle = hexA("#ffffff", dark ? 0.28 : 0.85);
  ctx.lineWidth = 2;
  ctx.stroke();

  const left = 72;
  const right = size.w - 72;
  drawMark(ctx, left, 62, 52, {
    plate: [tk.accent, dark ? glassAccent2.dark : glassAccent2.light],
    plateRadius: 22,
    rim: hexA("#ffffff", 0.55),
    bars: "#ffffff",
    bolt: "#ffffff",
  });
  drawText(ctx, BRAND_NAME, { x: left + 66, y: 98, maxW: 200, size: 26, weight: 700, color: tk.ink, dir: "ltr" });

  // the tool name in a pill
  ctx.font = `600 20px ${SHARE_FONT}`;
  const w = Math.min(250, Math.ceil(ctx.measureText(data.title).width) + 32);
  roundRectPath(ctx, right - w, 72, w, 36, 18);
  ctx.fillStyle = tk.soft;
  ctx.fill();
  drawText(ctx, data.title, { x: right - w / 2, y: 96, maxW: w - 28, size: 20, min: 14, weight: 600, color: tk.accent, align: "center" });

  drawText(ctx, data.main, { x: left, y: 196, maxW: right - left, size: 100, min: 20, weight: 700, color: tk.ink, dir: "ltr", baseline: "middle" });
  drawWrapped(ctx, data.sub, { x: left, y: 272, maxW: right - left, size: 26, lineHeight: 32, maxLines: 2, color: tk.ink2, dir: "auto" });
  drawFooterRow(ctx, data, { left, right, y: 346, footerColor: tk.ink2, handleColor: tk.accent });
}
