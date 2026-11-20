// Mathematical functions and constants on Decimal. Transcendental functions run in BigInt fixed point
// with guard digits and are rounded to the working precision (34 significant digits by default).

import { Decimal } from "./decimal";
import { CalcError } from "./errors";
import {
  atanFx,
  babs,
  expParts,
  lnRefined,
  piFx,
  pow10,
  quadrant,
  refine,
  sincosFx,
  sqrtFx,
  toFixedBig,
} from "./fixed";

export type AngleMode = "deg" | "rad";

export interface FnContext {
  angle: AngleMode;
  /** Working precision in significant digits. */
  digits: number;
  /** Optional work-budget hook; may throw CalcError('overflow'). */
  charge?: (units: number) => void;
}

type Impl = (args: Decimal[], ctx: FnContext) => Decimal;
interface FnDef {
  min: number;
  max: number;
  run: Impl;
}

const D = (n: number): Decimal => Decimal.from(n);
const ZERO = Decimal.ZERO;
const ONE = Decimal.ONE;
const TWO = D(2);
const HALF = D(0.5);
const D45 = D(45);
const D90 = D(90);
const D360 = D(360);

const fromFx = (v: bigint, W: number, P: number): Decimal => Decimal.fromScaled(v, W, P);

function domain(fn: string, msg: string): CalcError {
  return new CalcError("domain", `${fn}: ${msg}`, { fn });
}

// ---------- constants ----------

const constCache = new Map<string, Decimal>();

const CONSTANT_ALIASES: Record<string, string> = { pi: "pi", "π": "pi", e: "e", tau: "tau", "τ": "tau", phi: "phi", "φ": "phi" };
export const CONSTANT_NAMES: readonly string[] = ["pi", "e", "tau", "phi"];

export function isConstant(name: string): boolean {
  return Object.hasOwn(CONSTANT_ALIASES, name.toLowerCase());
}

export function getConstant(name: string, P: number = Decimal.precision): Decimal {
  const lower = name.toLowerCase();
  const canon = Object.hasOwn(CONSTANT_ALIASES, lower) ? CONSTANT_ALIASES[lower] : undefined;
  if (canon === undefined) throw new CalcError("unknown_ident", `unknown identifier ${name}`, { ident: name });
  const key = canon + ":" + P;
  const hit = constCache.get(key);
  if (hit) return hit;
  let v: Decimal;
  switch (canon) {
    case "pi":
      v = fromFx(piFx(P + 10), P + 10, P);
      break;
    case "tau":
      v = fromFx(piFx(P + 10) * 2n, P + 10, P);
      break;
    case "e": {
      const r = expParts(1n, 0, P);
      v = Decimal.make(r.m, r.s).roundSig(P);
      break;
    }
    default:
      v = D(5).sqrt(P + 5).add(ONE).div(TWO, P); // phi
  }
  constCache.set(key, v);
  return v;
}

// ---------- trigonometry ----------

function trigFx(x: Decimal, ctx: FnContext, W: number): { sin: bigint; cos: bigint } {
  const F = pow10(W);
  if (ctx.angle === "deg") {
    const d = x.mod(D360);
    const qd = d.add(D45).div(D90, 40).floor();
    const q = qd.toNumber();
    const r = d.sub(D90.mul(qd));
    if (r.isZero()) return quadrant(q, 0n, F);
    const rF = (toFixedBig(r.m, r.s, W) * piFx(W)) / (180n * F);
    return quadrant(q, rF, F);
  }
  const xF = toFixedBig(x.m, x.s, W);
  const tol = x.exponent >= 0 ? babs(xF) / pow10(ctx.digits - 1) : 0n;
  return sincosFx(xF, W, tol);
}

function trigWork(x: Decimal, ctx: FnContext): number {
  return ctx.digits + 20 + Math.max(0, x.nd - x.s) + Math.max(0, x.s - x.nd);
}

function sinDec(x: Decimal, ctx: FnContext): Decimal {
  const P = ctx.digits;
  const r = refine(P, trigWork(x, ctx), (W) => [trigFx(x, ctx, W).sin]);
  return fromFx(r.vals[0], r.W, P);
}

function cosDec(x: Decimal, ctx: FnContext): Decimal {
  const P = ctx.digits;
  const r = refine(P, trigWork(x, ctx), (W) => [trigFx(x, ctx, W).cos]);
  return fromFx(r.vals[0], r.W, P);
}

function tanDec(x: Decimal, ctx: FnContext): Decimal {
  const P = ctx.digits;
  const r = refine(P, trigWork(x, ctx), (W) => {
    const t = trigFx(x, ctx, W);
    return [t.sin, t.cos];
  });
  const [s, c] = r.vals;
  if (c === 0n) throw domain("tan", "undefined at this angle");
  return fromFx((s * pow10(r.W)) / c, r.W, P);
}

function cotDec(x: Decimal, ctx: FnContext): Decimal {
  const P = ctx.digits;
  const r = refine(P, trigWork(x, ctx), (W) => {
    const t = trigFx(x, ctx, W);
    return [t.sin, t.cos];
  });
  const [s, c] = r.vals;
  if (s === 0n) throw domain("cot", "undefined at this angle");
  return fromFx((c * pow10(r.W)) / s, r.W, P);
}

function radToOut(res: bigint, W: number, ctx: FnContext): bigint {
  return ctx.angle === "deg" ? (res * 180n * pow10(W)) / piFx(W) : res;
}

function atanDec(x: Decimal, ctx: FnContext): Decimal {
  if (x.isZero()) return ZERO;
  const P = ctx.digits;
  const r = refine(P, P + 20 + Math.max(0, x.s - x.nd), (W) => {
    const xF = toFixedBig(x.m, x.s, W);
    return [radToOut(atanFx(xF, W), W, ctx)];
  });
  return fromFx(r.vals[0], r.W, P);
}

function asinAcos(x: Decimal, ctx: FnContext, wantAcos: boolean): Decimal {
  const fn = wantAcos ? "acos" : "asin";
  if (x.abs().gt(ONE)) throw domain(fn, "argument must be in [-1, 1]");
  const P = ctx.digits;
  if (!wantAcos && x.isZero()) return ZERO;
  const r = refine(P, P + 20 + Math.max(0, x.s - x.nd), (W) => {
    const F = pow10(W);
    const xF = toFixedBig(x.m, x.s, W);
    const half = piFx(W) / 2n;
    const den = sqrtFx((F * F - xF * xF) / F, W);
    let a: bigint;
    if (den === 0n) a = xF < 0n ? -half : half;
    else a = atanFx((xF * F) / den, W);
    if (wantAcos) a = half - a;
    return [radToOut(a, W, ctx)];
  });
  return fromFx(r.vals[0], r.W, P);
}

function atan2Dec(y: Decimal, x: Decimal, ctx: FnContext): Decimal {
  if (x.isZero() && y.isZero()) throw domain("atan2", "undefined for (0, 0)");
  const P = ctx.digits;
  const r = refine(P, P + 25, (W) => {
    const pi = piFx(W);
    let a: bigint;
    if (x.isZero()) {
      a = y.sign() > 0 ? pi / 2n : -(pi / 2n);
    } else {
      const ratio = toFixedBig(...divParts(y, x, W + 5), W);
      a = atanFx(ratio, W);
      if (x.sign() < 0) a += y.sign() >= 0 ? pi : -pi;
    }
    return [radToOut(a, W, ctx)];
  });
  return fromFx(r.vals[0], r.W, P);
}

function divParts(y: Decimal, x: Decimal, digits: number): [bigint, number] {
  const q = y.div(x, digits);
  return [q.m, q.s];
}

// ---------- exp / ln / hyperbolic ----------

function expDec(x: Decimal, P: number): Decimal {
  if (x.isZero()) return ONE;
  const r = expParts(x.m, x.s, P);
  return Decimal.make(r.m, r.s).roundSig(P);
}

function lnPrec(x: Decimal, P: number): Decimal {
  if (x.sign() <= 0) throw domain("ln", "argument must be positive");
  if (x.eq(ONE)) return ZERO;
  const r = lnRefined(x.m, x.s, P);
  return fromFx(r.v, r.W, P);
}

function logBase(x: Decimal, base: Decimal, P: number, fn: string): Decimal {
  if (x.sign() <= 0) throw domain(fn, "argument must be positive");
  if (base.sign() <= 0 || base.eq(ONE)) throw domain(fn, "invalid base");
  return lnPrec(x, P + 8).div(lnPrec(base, P + 8), P);
}

/** sinh / cosh pair computed at working precision Q. Returns null for the "saturated" branch. */
function sinhSmall(x: Decimal, P: number): Decimal {
  // Taylor series: x + x^3/3! + ... (|x| < 0.5)
  const W = P + 20 + Math.max(0, x.s - x.nd);
  const F = pow10(W);
  const xF = toFixedBig(x.m, x.s, W);
  const x2 = (xF * xF) / F;
  let term = xF;
  let sum = xF;
  for (let k = 1n; term !== 0n; k += 2n) {
    term = (term * x2) / F / (k + 1n) / (k + 2n);
    sum += term;
  }
  return fromFx(sum, W, P);
}

function hyper(x: Decimal, P: number, kind: "sinh" | "cosh" | "tanh"): Decimal {
  if (x.isZero()) return kind === "cosh" ? ONE : ZERO;
  const ax = x.abs();
  const neg = x.isNegative();
  const Q = P + 20;
  // exp(-2|x|) below 10^-(P+10): result saturates to exp(|x|)/2 or 1.
  const saturated = ax.toNumber() * 0.8686 > P + 12;
  if (kind === "tanh" && saturated) return neg ? ONE.neg() : ONE;
  if (ax.lt(HALF) && kind !== "cosh") {
    const sh = sinhSmall(ax, P + 10);
    let res: Decimal;
    if (kind === "sinh") res = sh;
    else {
      const ch = hyper(ax, P + 10, "cosh");
      res = sh.div(ch, P + 5);
    }
    res = res.roundSig(P);
    return neg ? res.neg() : res;
  }
  const E = expDec(ax, Q);
  let res: Decimal;
  if (saturated) {
    res = E.div(TWO, P); // exp(-|x|) is negligible
  } else {
    const Ei = ONE.div(E, Q);
    if (kind === "cosh") res = E.add(Ei).div(TWO, P);
    else if (kind === "sinh") res = E.sub(Ei).div(TWO, P);
    else res = E.sub(Ei).div(E.add(Ei), P);
  }
  return kind === "cosh" ? res : neg ? res.neg() : res;
}

// ---------- combinatorics ----------

const FACT: bigint[] = [1n, 1n];

function smallInt(x: Decimal, fn: string, max: number, what = "argument"): number {
  if (!x.isInteger()) throw domain(fn, `${what} must be an integer`);
  if (x.isNegative()) throw domain(fn, `${what} must be non-negative`);
  if (x.exponent > 8) throw new CalcError("overflow", `${fn}: ${what} is too large`);
  const n = Number(x.m) * 10 ** -x.s;
  if (n > max) throw new CalcError("overflow", `${fn}: ${what} is too large`);
  return n;
}

function factBig(n: number): bigint {
  let r = FACT[FACT.length - 1];
  for (let i = FACT.length; i <= n; i++) {
    r *= BigInt(i);
    FACT.push(r);
  }
  return FACT[n];
}

function factDec(x: Decimal, ctx: FnContext): Decimal {
  const n = smallInt(x, "fact", 1000);
  ctx.charge?.(n > FACT.length ? n - FACT.length : 1);
  const r = factBig(n);
  return Decimal.fromScaled(r, 0, r.toString().length > Decimal.maxDigits ? ctx.digits : undefined);
}

function toBigInt(x: Decimal, fn: string): bigint {
  if (!x.isInteger()) throw domain(fn, "arguments must be integers");
  return x.m * pow10(-x.s);
}

function bgcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function limitBig(): bigint {
  return pow10(Decimal.maxDigits + 1);
}

function ncrDec(n: Decimal, k: Decimal, ctx: FnContext, perm: boolean): Decimal {
  const fn = perm ? "npr" : "ncr";
  const N = smallInt(n, fn, 100_000_000, "n");
  const K = smallInt(k, fn, 100_000_000, "k");
  if (K > N) throw domain(fn, "k must not exceed n");
  const lim = limitBig();
  let r = 1n;
  if (perm) {
    for (let i = 0; i < K; i++) {
      ctx.charge?.(1);
      r *= BigInt(N - i);
      if (r > lim) throw new CalcError("overflow", `${fn}: result is too large`);
    }
  } else {
    const kk = Math.min(K, N - K);
    for (let i = 1; i <= kk; i++) {
      ctx.charge?.(1);
      r = (r * BigInt(N - kk + i)) / BigInt(i);
      if (r > lim) throw new CalcError("overflow", `${fn}: result is too large`);
    }
  }
  return Decimal.make(r, 0);
}

// ---------- function table ----------

const INF = Number.MAX_SAFE_INTEGER;

const def = (min: number, max: number, run: Impl): FnDef => ({ min, max, run });

const BASE: Record<string, FnDef> = {
  sin: def(1, 1, (a, c) => sinDec(a[0], c)),
  cos: def(1, 1, (a, c) => cosDec(a[0], c)),
  tan: def(1, 1, (a, c) => tanDec(a[0], c)),
  cot: def(1, 1, (a, c) => cotDec(a[0], c)),
  asin: def(1, 1, (a, c) => asinAcos(a[0], c, false)),
  acos: def(1, 1, (a, c) => asinAcos(a[0], c, true)),
  atan: def(1, 1, (a, c) => atanDec(a[0], c)),
  atan2: def(2, 2, (a, c) => atan2Dec(a[0], a[1], c)),
  sinh: def(1, 1, (a, c) => hyper(a[0], c.digits, "sinh")),
  cosh: def(1, 1, (a, c) => hyper(a[0], c.digits, "cosh")),
  tanh: def(1, 1, (a, c) => hyper(a[0], c.digits, "tanh")),
  ln: def(1, 1, (a, c) => lnPrec(a[0], c.digits)),
  log: def(1, 2, (a, c) => logBase(a[0], a[1] ?? D(10), c.digits, "log")),
  log2: def(1, 1, (a, c) => logBase(a[0], TWO, c.digits, "log2")),
  log10: def(1, 1, (a, c) => {
    const x = a[0];
    if (x.sign() > 0 && x.m === 1n) return D(-x.s); // exact power of ten
    return logBase(x, D(10), c.digits, "log10");
  }),
  exp: def(1, 1, (a, c) => expDec(a[0], c.digits)),
  sqrt: def(1, 1, (a, c) => a[0].sqrt(c.digits)),
  cbrt: def(1, 1, (a, c) => a[0].cbrt(c.digits)),
  pow: def(2, 2, (a, c) => a[0].pow(a[1], c.digits)),
  abs: def(1, 1, (a) => a[0].abs()),
  floor: def(1, 1, (a) => a[0].floor()),
  ceil: def(1, 1, (a) => a[0].ceil()),
  trunc: def(1, 1, (a) => a[0].trunc()),
  sign: def(1, 1, (a) => D(a[0].sign())),
  round: def(1, 2, (a) => {
    const dp = a[1] ?? ZERO;
    if (!dp.isInteger() || dp.abs().gt(D(1000))) throw domain("round", "digits must be an integer in [-1000, 1000]");
    return a[0].round(dp.toNumber(), "half-up");
  }),
  fact: def(1, 1, (a, c) => factDec(a[0], c)),
  ncr: def(2, 2, (a, c) => ncrDec(a[0], a[1], c, false)),
  npr: def(2, 2, (a, c) => ncrDec(a[0], a[1], c, true)),
  gcd: def(1, INF, (a) => Decimal.make(a.map((x) => toBigInt(x, "gcd")).reduce(bgcd), 0)),
  lcm: def(1, INF, (a) =>
    Decimal.make(
      a
        .map((x) => toBigInt(x, "lcm"))
        .reduce((x, y) => (x === 0n || y === 0n ? 0n : babs(x * y) / bgcd(x, y))),
      0,
    ),
  ),
  min: def(1, INF, (a) => a.reduce((m, x) => (x.lt(m) ? x : m))),
  max: def(1, INF, (a) => a.reduce((m, x) => (x.gt(m) ? x : m))),
  sum: def(1, INF, (a) => a.reduce((s, x) => s.add(x), ZERO)),
  avg: def(1, INF, (a, c) => a.reduce((s, x) => s.add(x), ZERO).div(D(a.length), c.digits)),
  mod: def(2, 2, (a) => a[0].mod(a[1])),
  hypot: def(1, INF, (a, c) => a.reduce((s, x) => s.add(x.mul(x)), ZERO).sqrt(c.digits)),
};

const ALIASES: Record<string, string> = {
  tg: "tan",
  ctg: "cot",
  arcsin: "asin",
  arccos: "acos",
  arctan: "atan",
  arctg: "atan",
  lg: "log10",
  factorial: "fact",
  mean: "avg",
  average: "avg",
};

export const FUNCTION_NAMES: readonly string[] = [...Object.keys(BASE), ...Object.keys(ALIASES)];

function lookup(name: string): FnDef | undefined {
  const k = name.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BASE, k) && !Object.prototype.hasOwnProperty.call(ALIASES, k)) return undefined;
  return BASE[ALIASES[k] ?? k];
}

export function isFunction(name: string): boolean {
  return lookup(name) !== undefined;
}

export function normalizeFunctionName(name: string): string {
  const k = name.toLowerCase();
  return Object.prototype.hasOwnProperty.call(ALIASES, k) ? ALIASES[k] : k;
}

/** Call a built-in function. Throws CalcError (unknown_ident, arg_count, domain, ...). */
export function callFunction(name: string, args: Decimal[], ctx: FnContext): Decimal {
  const f = lookup(name);
  if (!f) throw new CalcError("unknown_ident", `unknown function ${name}`, { ident: name, fn: name });
  if (args.length < f.min || args.length > f.max) {
    const exp = f.max === INF ? `at least ${f.min}` : f.min === f.max ? String(f.min) : `${f.min} to ${f.max}`;
    throw new CalcError("arg_count", `${name} expects ${exp} argument(s), got ${args.length}`, { fn: name });
  }
  return f.run(args, ctx);
}

// Convenience wrappers for programmatic use (default context: radians, working precision).
export function defaultContext(angle: AngleMode = "rad", digits: number = Decimal.precision): FnContext {
  return { angle, digits };
}
