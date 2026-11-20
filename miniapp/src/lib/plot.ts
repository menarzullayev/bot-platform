// Graph geometry and sampling. Pure, DOM-free (the canvas drawing lives in ui/graph.ts).
// A View maps world coordinates to pixels: screenX = w/2 + (x - cx) * sx, screenY = h/2 - (y - cy) * sy.

import { autoRange, sampleFunction, toSegments, type Sampled } from "../../../worker/src/calc/symbolic/numeric";

export interface View {
  cx: number;
  cy: number;
  /** Pixels per world unit, horizontal and vertical. */
  sx: number;
  sy: number;
}

export const MIN_SCALE = 1e-6;
export const MAX_SCALE = 1e8;
/** A y value this far outside the visible band is treated as off-screen when joining segments. */
const CLIP_FACTOR = 50;

export type Fn = (x: number) => number;
export type Pt = [number, number];

export function defaultView(w: number, h: number, halfWidth = 10): View {
  const s = Math.max(1, w) / (2 * halfWidth);
  return { cx: 0, cy: 0, sx: s, sy: s };
}

export function toScreen(v: View, w: number, h: number, x: number, y: number): Pt {
  return [w / 2 + (x - v.cx) * v.sx, h / 2 - (y - v.cy) * v.sy];
}

export function toWorld(v: View, w: number, h: number, px: number, py: number): Pt {
  return [v.cx + (px - w / 2) / v.sx, v.cy - (py - h / 2) / v.sy];
}

export function bounds(v: View, w: number, h: number): { xmin: number; xmax: number; ymin: number; ymax: number } {
  const [xmin, ymax] = toWorld(v, w, h, 0, 0);
  const [xmax, ymin] = toWorld(v, w, h, w, h);
  return { xmin, xmax, ymin, ymax };
}

const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Drag by (dx, dy) screen pixels: the world follows the finger. */
export function panBy(v: View, dx: number, dy: number): View {
  return { ...v, cx: v.cx - dx / v.sx, cy: v.cy + dy / v.sy };
}

/** Zoom by `factor` (>1 = in) keeping the world point under (px, py) fixed. */
export function zoomAt(v: View, factor: number, px: number, py: number, w: number, h: number): View {
  if (!Number.isFinite(factor) || factor <= 0) return v;
  const sx = clampScale(v.sx * factor);
  const sy = clampScale(v.sy * factor);
  const [wx, wy] = toWorld(v, w, h, px, py);
  return { sx, sy, cx: wx - (px - w / 2) / sx, cy: wy + (py - h / 2) / sy };
}

/** 1, 2, 5 x 10^k step so that about `target` ticks cover `span`. */
export function niceStep(span: number, target = 8): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / Math.max(1, target);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * p;
}

/** Multiples of `step` inside [min, max]. */
export function ticks(min: number, max: number, step: number): number[] {
  if (!(step > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  const out: number[] = [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  if (last - first > 400) return [];
  for (let i = first; i <= last; i++) out.push(Math.abs(i * step) < step * 1e-9 ? 0 : Number((i * step).toPrecision(12)));
  return out;
}

/** Label for an axis tick (no float noise; compact exponent for very large/small values). */
export function formatTick(n: number, step: number): string {
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e6 || a < 1e-4) return n.toExponential(Math.max(0, Math.min(3, 1))).replace(/\.0+e/, "e").replace("e+", "e");
  const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step) + 1e-9)));
  return n.toFixed(decimals);
}

export interface Plot {
  /** Polylines in screen pixels (already split at poles/gaps). */
  lines: Pt[][];
  /** Raw samples in world coordinates (for tracing and auto-range). */
  samples: Sampled;
}

/**
 * Samples `f` across the visible x range (about one sample per 1.5 px, at most 3000) and converts to screen space.
 * Points far outside the visible band are kept (the canvas clips them) but a polyline is cut where the curve leaves
 * the band by a large margin, so near-vertical asymptote strokes never span the screen.
 */
export function samplePlot(f: Fn, v: View, w: number, h: number): Plot {
  const { xmin, xmax, ymin, ymax } = bounds(v, w, h);
  const n = Math.max(50, Math.min(3000, Math.round(w / 1.5)));
  const s = sampleFunction(f, xmin, xmax, n);
  const band = (ymax - ymin) * CLIP_FACTOR;
  const lines: Pt[][] = [];
  for (const seg of toSegments(s)) {
    let cur: Pt[] = [];
    for (const [x, y] of seg) {
      if (Math.abs(y - (ymin + ymax) / 2) > band) {
        if (cur.length > 1) lines.push(cur);
        cur = [];
        continue;
      }
      cur.push(toScreen(v, w, h, x, y));
    }
    if (cur.length > 1) lines.push(cur);
  }
  return { lines, samples: s };
}

/** A view that shows the functions' interesting part: x in [-halfWidth, halfWidth], y from a robust range. */
export function fitView(fns: Fn[], w: number, h: number, halfWidth = 10): View {
  const base = defaultView(w, h, halfWidth);
  const pts: Pt[] = [];
  for (const f of fns) pts.push(...sampleFunction(f, -halfWidth, halfWidth, 200).points);
  if (pts.length === 0) return base;
  const { min, max } = autoRange(pts);
  const span = Math.max(max - min, 1e-9);
  const sx = base.sx;
  // Fit the vertical range, but keep the picture readable: at most 4x stretched / 6x squashed against the x axis,
  // and exactly 1:1 when the fitted ratio is close to square.
  let sy = Math.min(sx * 4, Math.max(sx / 6, h / span));
  if (sy / sx > 0.6 && sy / sx < 1.6) sy = sx;
  sy = Math.min(MAX_SCALE, Math.max(MIN_SCALE, sy));
  return { cx: 0, cy: (min + max) / 2, sx, sy };
}

export interface TableRow {
  x: number;
  y: number | null;
}

/** Table of values: x = from + i * step. `y` is null where f is undefined or not finite. */
export function tableRows(f: Fn, from: number, step: number, count: number): TableRow[] {
  const out: TableRow[] = [];
  const n = Math.max(0, Math.min(200, Math.floor(count)));
  for (let i = 0; i < n; i++) {
    const x = Number((from + i * step).toPrecision(12));
    let y: number | null;
    try {
      const v = f(x);
      y = Number.isFinite(v) ? Number(v.toPrecision(12)) : null;
    } catch {
      y = null;
    }
    out.push({ x, y });
  }
  return out;
}

/** Nearest sample to a world x (for tracing); null when no finite sample exists. */
export function traceAt(samples: Sampled, x: number): Pt | null {
  const pts = samples.points;
  if (pts.length === 0) return null;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] < x) lo = mid + 1;
    else hi = mid;
  }
  const a = pts[Math.max(0, lo - 1)];
  const b = pts[lo];
  return Math.abs(a[0] - x) <= Math.abs(b[0] - x) ? a : b;
}
