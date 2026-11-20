// Drawing helpers shared by the share cards of every pack (DEC-011, DEC-014). A pack decides the look (background, plate,
// colours, where things sit); this file only holds the mechanics that must be identical everywhere: fitting text to a width,
// two-line wrapping, bidi handling, the TezCalc mark and the bot handle. System font stack only, no network, no images.

import { SHARE_SIZE, type ShareData, type ShareSize } from "../contract/model";

export const SHARE_W = SHARE_SIZE.w;
export const SHARE_H = SHARE_SIZE.h;
/** Same stack as the app body (core.css), so the card never needs a web font. */
export const SHARE_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Helvetica Neue", Arial, sans-serif';
export const SHARE_MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';
export const BOT_HANDLE = "@tezcalc_bot";
export const BRAND_NAME = "TezCalc";

// Letters of right-to-left scripts only: Arabic-Indic digits (U+0660-0669, U+06F0-06F9) and Arabic punctuation are neutral, so a
// date or an expression written with them stays left-to-right.
const RTL_RE = /[\u0590-\u05FF\u061C\u0621-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF\u0750-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
/** True when the text contains Hebrew/Arabic letters: such text is shaped right-to-left by the canvas. */
export const isRtlText = (s: string): boolean => RTL_RE.test(s);

const AN_RE = /[\u0660-\u0669\u06F0-\u06F9]/;
/**
 * The string to hand to fillText. Left-to-right text that contains Arabic-Indic digits is wrapped in LRO..PDF: by the bidi rules
 * such digits turn neighbouring operators into a right-to-left run and "12*(3+4)" would be painted back to front. The override
 * keeps the logical order on screen; it has no width, so measureText is unaffected.
 */
export function visible(text: string, rtl: boolean): string {
  return !rtl && AN_RE.test(text) ? "\u202D" + text + "\u202C" : text;
}

export function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export interface TextOpts {
  x: number;
  y: number;
  maxW: number;
  /** Largest font size; the text shrinks in 2 px steps down to `min`, then is cut with an ellipsis. */
  size: number;
  min?: number;
  weight?: number | string;
  family?: string;
  color: string;
  align?: "left" | "right" | "center";
  baseline?: CanvasTextBaseline;
  /** "ltr" forces left-to-right (numbers, formulas); "auto" follows the script of the text. */
  dir?: "ltr" | "auto";
}

function applyFont(ctx: CanvasRenderingContext2D, px: number, o: Pick<TextOpts, "weight" | "family">): void {
  ctx.font = `${o.weight ?? 400} ${px}px ${o.family ?? SHARE_FONT}`;
}

function applyDir(ctx: CanvasRenderingContext2D, text: string, dir: "ltr" | "auto" | undefined): void {
  ctx.direction = dir === "ltr" ? "ltr" : isRtlText(text) ? "rtl" : "ltr";
}

/** Cuts `text` so it fits `maxW` with the current font; adds an ellipsis. */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(chars.slice(0, mid).join("") + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("").trimEnd() + "…";
}

/** Draws one line, shrinking the font to fit. Returns the font size used and the drawn width. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, o: TextOpts): { px: number; width: number } {
  let px = o.size;
  const min = o.min ?? o.size;
  applyFont(ctx, px, o);
  applyDir(ctx, text, o.dir);
  while (px > min && ctx.measureText(text).width > o.maxW) {
    px -= 2;
    applyFont(ctx, px, o);
  }
  const shown = ellipsize(ctx, text, o.maxW);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.baseline ?? "alphabetic";
  ctx.fillText(visible(shown, ctx.direction === "rtl"), o.x, o.y);
  return { px, width: ctx.measureText(shown).width };
}

export interface WrapOpts extends Omit<TextOpts, "min" | "size"> {
  size: number;
  lineHeight: number;
  maxLines: number;
}

/** Breaks `text` into at most `maxLines` lines of the current font (spaces first, then inside long words). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const flushWord = (w: string): void => {
    // a word wider than a line is broken between characters
    let rest = [...w];
    while (rest.length) {
      let n = rest.length;
      while (n > 1 && ctx.measureText(rest.slice(0, n).join("")).width > maxW) n--;
      lines.push(rest.slice(0, n).join(""));
      rest = rest.slice(n);
    }
  };
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (ctx.measureText(next).width <= maxW) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = "";
    if (ctx.measureText(w).width <= maxW) cur = w;
    else {
      flushWord(w);
      cur = lines.pop() ?? "";
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = ellipsize(ctx, kept[maxLines - 1] + " " + lines.slice(maxLines).join(" "), maxW);
    return kept;
  }
  return lines;
}

/** Draws wrapped text; returns the number of lines drawn. */
export function drawWrapped(ctx: CanvasRenderingContext2D, text: string, o: WrapOpts): number {
  applyFont(ctx, o.size, o);
  applyDir(ctx, text, o.dir);
  const lines = wrapLines(ctx, text, o.maxW, o.maxLines);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.baseline ?? "alphabetic";
  const rtl = ctx.direction === "rtl";
  lines.forEach((l, i) => ctx.fillText(visible(l, rtl), o.x, o.y + i * o.lineHeight));
  return lines.length;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.arcTo(x + w, y, x + w, y + k, k);
  ctx.lineTo(x + w, y + h - k);
  ctx.arcTo(x + w, y + h, x + w - k, y + h, k);
  ctx.lineTo(x + k, y + h);
  ctx.arcTo(x, y + h, x, y + h - k, k);
  ctx.lineTo(x, y + k);
  ctx.arcTo(x, y, x + k, y, k);
  ctx.closePath();
}

/** The footer + bot handle row common to every card: footer on the left (may be empty), handle on the right. */
export function drawFooterRow(
  ctx: CanvasRenderingContext2D,
  data: ShareData,
  o: { left: number; right: number; y: number; footerColor: string; handleColor: string; family?: string; footerSize?: number; handleSize?: number },
): void {
  const handle = drawText(ctx, BOT_HANDLE, { x: o.right, y: o.y, maxW: 220, size: o.handleSize ?? 22, weight: 700, color: o.handleColor, align: "right", dir: "ltr", family: o.family });
  if (data.footer) {
    drawText(ctx, data.footer, {
      x: o.left,
      y: o.y,
      maxW: o.right - o.left - handle.width - 24,
      size: o.footerSize ?? 20,
      min: 14,
      color: o.footerColor,
      family: o.family,
    });
  }
}

// ---------- the TezCalc mark (the prototypes' MARK, viewBox 72x72) ----------

export interface MarkStyle {
  /** Plate fill: a colour, or a diagonal gradient [from, to]. Absent = no plate (techno). */
  plate?: string | readonly [string, string];
  plateRadius?: number;
  /** Hairline round the plate (glass). */
  rim?: string;
  /** Soft double shadow of the plate (tactile): [dark, light, blur px, offset px] in canvas pixels. */
  shadow?: readonly [string, string, number, number];
  /** Colour of the two "=" bars and of the bolt. */
  bars: string;
  bolt: string;
  /** Round (plates) or square (techno) bar ends. */
  barRadius?: number;
  /** HUD corner brackets (techno). */
  brackets?: string;
}

/** Draws the mark with its top-left at (x, y), `size` px wide. */
export function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, m: MarkStyle): void {
  const s = size / 72;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (m.plate) {
    const r = m.plateRadius ?? 20;
    const fill = (): void => {
      if (typeof m.plate === "string") ctx.fillStyle = m.plate;
      else {
        const g = ctx.createLinearGradient(4, 4, 68, 68);
        g.addColorStop(0, m.plate![0]);
        g.addColorStop(1, m.plate![1]);
        ctx.fillStyle = g;
      }
      roundRectPath(ctx, 4, 4, 64, 64, r);
      ctx.fill();
    };
    if (m.shadow) {
      const [dark, light, blur, off] = m.shadow;
      ctx.shadowColor = dark;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = off;
      ctx.shadowOffsetY = off;
      fill();
      ctx.shadowColor = light;
      ctx.shadowOffsetX = -off;
      ctx.shadowOffsetY = -off;
      fill();
      ctx.shadowColor = "rgba(0,0,0,0)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    fill();
    if (m.rim) {
      ctx.strokeStyle = m.rim;
      ctx.lineWidth = 1;
      roundRectPath(ctx, 4.5, 4.5, 63, 63, r - 0.5);
      ctx.stroke();
    }
  }
  if (m.brackets) {
    ctx.strokeStyle = m.brackets;
    ctx.lineWidth = 3;
    ctx.lineCap = "square";
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of [
      [10, 4, 30, 4],
      [4, 10, 4, 30],
      [62, 4, 42, 4],
      [68, 10, 68, 30],
      [10, 68, 30, 68],
      [4, 62, 4, 42],
      [62, 68, 42, 68],
      [68, 62, 68, 42],
    ]) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  ctx.fillStyle = m.bars;
  const br = m.barRadius ?? 3;
  roundRectPath(ctx, 19, 25, 26, 6, br);
  ctx.fill();
  roundRectPath(ctx, 19, 39, 26, 6, br);
  ctx.fill();
  // the bolt: M47 14 33 38h9l-4 20 15-26h-9z
  ctx.fillStyle = m.bolt;
  ctx.beginPath();
  ctx.moveTo(47, 14);
  ctx.lineTo(33, 38);
  ctx.lineTo(42, 38);
  ctx.lineTo(38, 58);
  ctx.lineTo(53, 32);
  ctx.lineTo(44, 32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Fills the whole canvas (JPEG has no alpha: every card starts from an opaque colour). */
export function fillAll(ctx: CanvasRenderingContext2D, size: ShareSize, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size.w, size.h);
}
