// Fast double-precision evaluation for plots and numeric integration. No dynamic code evaluation: the AST is
// compiled into a tree of closures.

import type { Node } from "../parser";
import { constName, dependsOn, isKnownFunction, normalizeNode } from "./ast";
import { SymbolicError } from "./types";

export type Fn1 = (x: number) => number;

function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

export function factorial(x: number): number {
  if (!Number.isFinite(x) || x < 0) return NaN;
  if (Number.isInteger(x)) {
    if (x > 170) return Infinity;
    let r = 1;
    for (let i = 2; i <= x; i++) r *= i;
    return r;
  }
  return gamma(x + 1);
}

/** a^b with real roots of negative bases for odd denominators (cbrt(-8) = -2). */
export function realPow(a: number, b: number): number {
  if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  for (const d of [3, 5, 7, 9]) {
    const t = b * d;
    if (Math.abs(t - Math.round(t)) < 1e-12) {
      const p = Math.round(t);
      const r = Math.pow(-a, b);
      return p % 2 === 0 ? r : -r;
    }
  }
  return NaN;
}

const F1: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (x) => 1 / Math.tan(x),
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  ln: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  trunc: Math.trunc,
  sign: Math.sign,
  fact: factorial,
};

function compile(n: Node, v: string): Fn1 {
  if (!dependsOn(n, v) && n.type !== "num") {
    // constant subtree: fold once
    try {
      const f = compileNode(n, v);
      const c = f(0);
      return () => c;
    } catch (e) {
      if (e instanceof SymbolicError) throw e;
    }
  }
  return compileNode(n, v);
}

function compileNode(n: Node, v: string): Fn1 {
  switch (n.type) {
    case "num": {
      const c = n.value.toNumber();
      return () => c;
    }
    case "ident": {
      if (n.name === v) return (x) => x;
      const c = constName(n.name);
      if (c === "pi") return () => Math.PI;
      if (c === "e") return () => Math.E;
      if (c === "tau") return () => 2 * Math.PI;
      if (c === "phi") return () => (1 + Math.sqrt(5)) / 2;
      return () => NaN;
    }
    case "unary": {
      const a = compile(n.arg, v);
      return n.op === "-" ? (x) => -a(x) : a;
    }
    case "postfix": {
      const a = compile(n.arg, v);
      return n.op === "percent" ? (x) => a(x) / 100 : (x) => factorial(a(x));
    }
    case "implicit": {
      const a = compile(n.left, v);
      const b = compile(n.right, v);
      return (x) => a(x) * b(x);
    }
    case "assign":
      throw new SymbolicError("unsupported", "assignments are not supported");
    case "binary": {
      const a = compile(n.left, v);
      const b = compile(n.right, v);
      switch (n.op) {
        case "+":
          if (n.right.type === "postfix" && n.right.op === "percent") {
            const p = compile(n.right.arg, v);
            return (x) => a(x) * (1 + p(x) / 100);
          }
          return (x) => a(x) + b(x);
        case "-":
          if (n.right.type === "postfix" && n.right.op === "percent") {
            const p = compile(n.right.arg, v);
            return (x) => a(x) * (1 - p(x) / 100);
          }
          return (x) => a(x) - b(x);
        case "*":
        case "of":
          return (x) => a(x) * b(x);
        case "/":
          return (x) => a(x) / b(x);
        case "^":
          return (x) => realPow(a(x), b(x));
        case "mod":
          return (x) => {
            const d = b(x);
            return d === 0 ? NaN : a(x) - d * Math.floor(a(x) / d);
          };
      }
      break;
    }
    case "call": {
      const name = n.name.toLowerCase();
      if (!isKnownFunction(name)) throw new SymbolicError("unknown_function", `unknown function ${n.name}`);
      const args = n.args.map((a) => compile(a, v));
      const f1 = F1[name];
      if (f1 !== undefined) {
        if (args.length !== 1) throw new SymbolicError("invalid", `${name} expects 1 argument`);
        const a = args[0];
        return (x) => f1(a(x));
      }
      switch (name) {
        case "log":
          if (args.length === 1) {
            const a = args[0];
            return (x) => Math.log10(a(x));
          }
          if (args.length === 2) return (x) => Math.log(args[0](x)) / Math.log(args[1](x));
          break;
        case "pow":
          if (args.length === 2) return (x) => realPow(args[0](x), args[1](x));
          break;
        case "atan2":
          if (args.length === 2) return (x) => Math.atan2(args[0](x), args[1](x));
          break;
        case "min":
          return (x) => Math.min(...args.map((f) => f(x)));
        case "max":
          return (x) => Math.max(...args.map((f) => f(x)));
        case "hypot":
          return (x) => Math.hypot(...args.map((f) => f(x)));
        case "round":
          if (args.length === 1) return (x) => Math.round(args[0](x));
          break;
        case "mod":
          if (args.length === 2) {
            return (x) => {
              const d = args[1](x);
              return d === 0 ? NaN : args[0](x) - d * Math.floor(args[0](x) / d);
            };
          }
          break;
        default:
      }
      throw new SymbolicError("unsupported", `${name} is not supported for plotting`);
    }
  }
  throw new SymbolicError("unsupported");
}

/**
 * Compile an AST into a fast (x:number)=>number closure tree (doubles, radians).
 * Throws SymbolicError for unknown functions or unsupported nodes; evaluation itself never throws (NaN/Infinity).
 */
export function compileFast(ast: Node, variable = "x"): Fn1 {
  return compile(normalizeNode(ast), variable);
}

// ---------- sampling ----------

export interface Sampled {
  /** Finite sample points in increasing x. */
  points: Array<[number, number]>;
  /** Index j means: do NOT connect points[j-1] and points[j] (asymptote, jump or domain gap). */
  breaks: number[];
}

const isFin = (y: number): boolean => Number.isFinite(y);

/**
 * Sample f on [x0, x1] at n+1 uniform positions and repair the result: domain borders are refined by bisection,
 * poles (sign change with growing magnitude) and jumps become breaks.
 */
export function sampleFunction(ast: Node | Fn1, x0: number, x1: number, n = 400, variable = "x"): Sampled {
  const f: Fn1 = typeof ast === "function" ? ast : compileFast(ast, variable);
  if (!isFin(x0) || !isFin(x1) || x0 === x1) return { points: [], breaks: [] };
  if (x0 > x1) [x0, x1] = [x1, x0];
  const N = Math.max(2, Math.min(5000, Math.floor(n)));
  const h = (x1 - x0) / N;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = i === N ? x1 : x0 + i * h;
    xs.push(x);
    ys.push(f(x));
  }
  // typical step of the curve (median of finite |dy|) for jump detection
  const diffs: number[] = [];
  for (let i = 1; i <= N; i++) if (isFin(ys[i]) && isFin(ys[i - 1])) diffs.push(Math.abs(ys[i] - ys[i - 1]));
  diffs.sort((a, b) => a - b);
  const medDiff = diffs.length > 0 ? diffs[Math.floor(diffs.length / 2)] : 0;

  const points: Array<[number, number]> = [];
  const breaks: number[] = [];
  let pending = false;
  const addPoint = (x: number, y: number): void => {
    if (pending && points.length > 0) breaks.push(points.length);
    pending = false;
    points.push([x, y]);
  };
  let extra = 0;
  for (let i = 0; i <= N; i++) {
    const y = ys[i];
    const prevFinite = i > 0 && isFin(ys[i - 1]);
    if (!isFin(y)) {
      if (prevFinite && extra < 60) {
        const b = bisectBorder(f, xs[i - 1], xs[i]);
        if (b !== null) {
          addPoint(b[0], b[1]);
          extra++;
        }
      }
      pending = true;
      continue;
    }
    if (i > 0 && !prevFinite) {
      pending = true;
      if (extra < 60) {
        const b = bisectBorder(f, xs[i], xs[i - 1]);
        if (b !== null) {
          addPoint(b[0], b[1]);
          extra++;
        }
      }
    }
    if (prevFinite && extra < 60) {
      const y0 = ys[i - 1];
      const dy = Math.abs(y - y0);
      if ((y0 < 0 && y > 0) || (y0 > 0 && y < 0)) {
        // bisect on the sign: a continuous crossing ends near 0, a pole or a jump ends at its sides
        let a = xs[i - 1];
        let b = xs[i];
        const negLeft = y0 < 0;
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2;
          const fm = f(m);
          if (!isFin(fm)) {
            b = m;
            continue;
          }
          if (fm < 0 === negLeft) a = m;
          else b = m;
        }
        const fl = f(a);
        const fr = f(b);
        const big = Math.max(Math.abs(y0), Math.abs(y), 1e-300);
        const edge = Math.max(isFin(fl) ? Math.abs(fl) : Infinity, isFin(fr) ? Math.abs(fr) : Infinity);
        const pole = edge > big * 4 && edge > 1e3 * (medDiff + 1e-9);
        const jump = !pole && isFin(fl) && isFin(fr) && Math.abs(fr - fl) > 0.5 * big && dy > 8 * (medDiff + 1e-12);
        if (pole || jump) {
          if (isFin(fl)) addPoint(a, fl);
          pending = true;
          if (isFin(fr)) addPoint(b, fr);
          extra++;
        }
      } else if (dy > 20 * (medDiff + 1e-12) && dy > 1e-9) {
        const prevDiff = i >= 2 && isFin(ys[i - 2]) ? Math.abs(y0 - ys[i - 2]) : 0;
        const nextDiff = i + 1 <= N && isFin(ys[i + 1]) ? Math.abs(ys[i + 1] - y) : 0;
        let isJump = dy > 8 * Math.max(prevDiff, nextDiff, 1e-12);
        if (!isJump && nextDiff > 20 * (medDiff + 1e-12) && dy >= nextDiff) {
          // a jump split over two intervals (a sample sits exactly on the discontinuity)
          const outer = i + 2 <= N && isFin(ys[i + 2]) ? Math.abs(ys[i + 2] - ys[i + 1]) : 0;
          isJump = Math.abs(ys[i + 1] - y0) > 8 * Math.max(prevDiff, outer, 1e-12);
        }
        if (isJump) {
          pending = true;
          extra++;
        }
      }
    }
    addPoint(xs[i], y);
  }
  const uniq = [...new Set(breaks)].filter((b) => b > 0 && b < points.length).sort((a, b) => a - b);
  return { points, breaks: uniq };
}

/** Between a finite point and an undefined one find the last finite x (bisection). */
function bisectBorder(f: Fn1, finiteX: number, badX: number): [number, number] | null {
  let a = finiteX;
  let b = badX;
  let ya = f(a);
  if (!isFin(ya)) return null;
  for (let k = 0; k < 60; k++) {
    const m = (a + b) / 2;
    const ym = f(m);
    if (isFin(ym)) {
      a = m;
      ya = ym;
    } else b = m;
  }
  return [a, ya];
}

/** Split sampled points into polyline segments at the breaks. */
export function toSegments(s: Sampled): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let start = 0;
  for (const b of [...s.breaks, s.points.length]) {
    if (b > start) out.push(s.points.slice(start, b));
    start = b;
  }
  return out;
}

/** Robust y-range for plotting: ignores extreme outliers (asymptotes) and adds padding. */
export function autoRange(points: Array<[number, number]>): { min: number; max: number } {
  const ys = points.map((p) => p[1]).filter(isFin).sort((a, b) => a - b);
  if (ys.length === 0) return { min: -1, max: 1 };
  const at = (p: number): number => ys[Math.min(ys.length - 1, Math.max(0, Math.round(p * (ys.length - 1))))];
  let lo = at(0.02);
  let hi = at(0.98);
  if (ys.length < 20) {
    lo = ys[0];
    hi = ys[ys.length - 1];
  }
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) {
    const c = hi;
    const half = Math.max(1, Math.abs(c) * 0.1);
    return { min: c - half, max: c + half };
  }
  const span = hi - lo;
  // include zero when it is close to the data
  if (lo > 0 && lo < span * 0.5) lo = 0;
  if (hi < 0 && -hi < span * 0.5) hi = 0;
  const pad = (hi - lo) * 0.08;
  return { min: lo - pad, max: hi + pad };
}

// ---------- adaptive Gauss-Kronrod (G7, K15) ----------

const XGK = [
  0.9914553711208126, 0.9491079123427585, 0.8648644233597691, 0.7415311855993945, 0.5860872354676911, 0.4058451513773972,
  0.20778495500789848, 0,
];
const WGK = [
  0.022935322010529224, 0.06309209262997855, 0.10479001032225018, 0.14065325971552592, 0.1690047266392679, 0.19035057806478542,
  0.20443294007529889, 0.20948214108472782,
];
const WG = [0.1294849661688697, 0.27970539148927664, 0.3818300505051189, 0.4179591836734694];

interface Seg {
  a: number;
  b: number;
  val: number;
  err: number;
}

function gk15(f: Fn1, a: number, b: number): Seg {
  const c = (a + b) / 2;
  const hl = (b - a) / 2;
  const ev = (x: number): number => {
    let y = f(x);
    if (!isFin(y)) y = f(x + hl * 1e-9);
    if (!isFin(y)) y = f(x - hl * 1e-9);
    return y;
  };
  const fc = ev(c);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = hl * XGK[j];
    const y1 = ev(c - dx);
    const y2 = ev(c + dx);
    resK += WGK[j] * (y1 + y2);
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (y1 + y2);
  }
  return { a, b, val: resK * hl, err: Math.abs((resK - resG) * hl) };
}

export interface NumericIntegral {
  value: number;
  error: number;
  converged: boolean;
}

/** Adaptive G7K15 integral of f over [a, b]. Non-finite values are reported as NaN. */
export function integrateNumeric(f: Fn1, a: number, b: number, relTol = 1e-11): NumericIntegral {
  if (a === b) return { value: 0, error: 0, converged: true };
  let sign = 1;
  if (a > b) {
    [a, b] = [b, a];
    sign = -1;
  }
  const segs: Seg[] = [];
  const parts = 4;
  for (let i = 0; i < parts; i++) segs.push(gk15(f, a + ((b - a) * i) / parts, a + ((b - a) * (i + 1)) / parts));
  let total = 0;
  let err = 0;
  const MAX = 600;
  for (let it = 0; it < MAX; it++) {
    total = 0;
    err = 0;
    let worst = 0;
    for (let i = 0; i < segs.length; i++) {
      total += segs[i].val;
      err += segs[i].err;
      if (segs[i].err > segs[worst].err) worst = i;
    }
    if (!isFin(total)) return { value: NaN, error: Infinity, converged: false };
    if (err <= relTol * Math.abs(total) || err < 1e-15) return { value: sign * total, error: err, converged: true };
    const s = segs[worst];
    const m = (s.a + s.b) / 2;
    if (m === s.a || m === s.b) break;
    segs.splice(worst, 1, gk15(f, s.a, m), gk15(f, m, s.b));
  }
  total = 0;
  err = 0;
  for (const s of segs) {
    total += s.val;
    err += s.err;
  }
  return { value: sign * total, error: err, converged: err <= 1e-8 * Math.max(1, Math.abs(total)) };
}
