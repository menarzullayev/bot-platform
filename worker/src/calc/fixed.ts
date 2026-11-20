// Fixed-point BigInt kernels (value = v / 10^W). Pure bigint code: no dependency on Decimal,
// so decimal.ts and functions.ts can both build on it without an import cycle.

import { CalcError } from "./errors";

// ---------- small helpers ----------

const P10: bigint[] = [];
{
  let v = 1n;
  for (let i = 0; i <= 80; i++) {
    P10.push(v);
    v *= 10n;
  }
}

export function pow10(n: number): bigint {
  const c = P10[n];
  if (c !== undefined) return c;
  if (n < 0 || !Number.isInteger(n)) throw new RangeError("pow10: bad exponent");
  const v = 10n ** BigInt(n);
  if (n <= 1024) P10[n] = v;
  return v;
}

export function ndigits(v: bigint): number {
  return (v < 0n ? -v : v).toString().length;
}

export function babs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

export function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

/** floor(sqrt(n)) for n >= 0. */
export function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt(((n.toString(16).length * 4) >> 1) + 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** floor(cbrt(n)) for n >= 0. */
export function icbrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.floor((n.toString(16).length * 4) / 3) + 1);
  for (;;) {
    const y = (2n * x + n / (x * x)) / 3n;
    if (y >= x) return x;
    x = y;
  }
}

/** m * 10^-s converted to a fixed-point integer with W fractional digits (truncated). */
export function toFixedBig(m: bigint, s: number, W: number): bigint {
  const sh = W - s;
  return sh >= 0 ? m * pow10(sh) : m / pow10(-sh);
}

// ---------- pi ----------

let piCache: { W: number; v: bigint } | undefined;

function atanInv(n: bigint, F: bigint): bigint {
  const n2 = n * n;
  let p = F / n;
  let sum = p;
  let k = 3n;
  let neg = true;
  while (p !== 0n) {
    p /= n2;
    const t = p / k;
    sum += neg ? -t : t;
    neg = !neg;
    k += 2n;
  }
  return sum;
}

export function piFx(W: number): bigint {
  if (piCache && piCache.W >= W) return piCache.v / pow10(piCache.W - W);
  const g = W + 12;
  const F = pow10(g);
  const v = 4n * (4n * atanInv(5n, F) - atanInv(239n, F));
  piCache = { W: g, v };
  return v / pow10(12);
}

// ---------- ln ----------

function atanhFx(t: bigint, F: bigint): bigint {
  const t2 = (t * t) / F;
  let p = t;
  let sum = t;
  let k = 3n;
  while (p !== 0n) {
    p = (p * t2) / F;
    sum += p / k;
    k += 2n;
  }
  return sum;
}

const lnCache = new Map<number, { ln2: bigint; ln10: bigint }>();

export function lnConsts(W: number): { ln2: bigint; ln10: bigint } {
  const hit = lnCache.get(W);
  if (hit) return hit;
  const F = pow10(W + 10);
  const ln2 = 2n * atanhFx(F / 3n, F);
  const ln10 = 3n * ln2 + 2n * atanhFx(F / 9n, F); // 10 = 8 * 1.25
  const res = { ln2: ln2 / pow10(10), ln10: ln10 / pow10(10) };
  if (lnCache.size > 64) lnCache.clear();
  lnCache.set(W, res);
  return res;
}

/** ln(m * 10^-s), m > 0, as fixed-point with W digits. Needs W >= 20. */
export function lnFx(m: bigint, s: number, W: number): bigint {
  const nd = ndigits(m);
  const e10 = nd - 1 - s;
  const y = (m * pow10(W)) / pow10(nd - 1); // in [1, 10)
  const c = lnConsts(W);
  const F = pow10(W);
  const approx = Number(y / pow10(W - 15)) / 1e15;
  const k = Math.max(0, Math.round(Math.log2(approx)));
  const z = y >> BigInt(k);
  const t = ((z - F) * F) / (z + F);
  return BigInt(e10) * c.ln10 + BigInt(k) * c.ln2 + 2n * atanhFx(t, F);
}

export interface Fx {
  v: bigint;
  W: number;
}

/** Generic "recompute with more digits if the result lost precision" helper. */
export function refine(P: number, W0: number, compute: (W: number) => bigint[]): { vals: bigint[]; W: number } {
  let W = W0;
  for (let attempt = 0; ; attempt++) {
    const vals = compute(W);
    let worst = Infinity;
    for (const v of vals) {
      if (v !== 0n) worst = Math.min(worst, ndigits(v));
    }
    if (worst >= P + 8 || attempt >= 3) return { vals, W };
    W += P + 8 - worst + 4;
  }
}

/** ln with at least P+8 correct significant digits. */
export function lnRefined(m: bigint, s: number, P: number): Fx {
  const r = refine(P, P + 20, (W) => [lnFx(m, s, W)]);
  return { v: r.vals[0], W: r.W };
}

// ---------- exp ----------

/** exp(m * 10^-s) as (mantissa, scale) with ~P+25 correct digits. */
export function expParts(m: bigint, s: number, P: number): { m: bigint; s: number } {
  if (m === 0n) return { m: 1n, s: 0 };
  const xn = Number(m.toString() + "e" + -s);
  if (!Number.isFinite(xn) || Math.abs(xn) > 23100) throw new CalcError("overflow", "result is too large or too small");
  const W = P + 25;
  const F = pow10(W);
  const k = Math.round(xn / Math.LN10);
  const r = toFixedBig(m, s, W) - BigInt(k) * lnConsts(W).ln10;
  let term = F;
  let sum = F;
  for (let n = 1n; term !== 0n; n++) {
    term = (term * r) / F / n;
    sum += term;
  }
  return { m: sum, s: W - k };
}

// ---------- trig ----------

function taylorSinCos(r: bigint, F: bigint): { s: bigint; c: bigint } {
  const r2 = (r * r) / F;
  let ts = r;
  let ss = r;
  let tc = F;
  let sc = F;
  for (let k = 1n; ts !== 0n || tc !== 0n; k += 2n) {
    tc = -((tc * r2) / F / (k * (k + 1n)));
    sc += tc;
    ts = -((ts * r2) / F / ((k + 1n) * (k + 2n)));
    ss += ts;
  }
  return { s: ss, c: sc };
}

/** sin/cos of r (|r| <= ~pi/4) rotated by q quarter turns. */
export function quadrant(q: number, r: bigint, F: bigint): { sin: bigint; cos: bigint } {
  let s: bigint;
  let c: bigint;
  if (r === 0n) {
    s = 0n;
    c = F;
  } else {
    const t = taylorSinCos(r, F);
    s = t.s;
    c = t.c;
  }
  switch (q & 3) {
    case 0:
      return { sin: s, cos: c };
    case 1:
      return { sin: c, cos: -s };
    case 2:
      return { sin: -s, cos: -c };
    default:
      return { sin: -c, cos: s };
  }
}

/**
 * sin/cos of a radian argument x (fixed-point, W digits). Values within snapTol of a multiple of pi/2
 * are treated as exact multiples (the argument cannot resolve anything finer).
 */
export function sincosFx(x: bigint, W: number, snapTol: bigint): { sin: bigint; cos: bigint } {
  const F = pow10(W);
  const pi = piFx(W);
  const n = floorDiv(4n * x + pi, 2n * pi);
  let r = (2n * x - n * pi) / 2n;
  if (babs(r) <= snapTol) r = 0n;
  const q = Number(((n % 4n) + 4n) % 4n);
  return quadrant(q, r, F);
}

// ---------- inverse trig ----------

/** atan(x) in radians, x fixed-point. */
export function atanFx(x: bigint, W: number): bigint {
  const F = pow10(W);
  const neg = x < 0n;
  let a = neg ? -x : x;
  let inv = false;
  if (a > F) {
    a = (F * F) / a;
    inv = true;
  }
  for (let i = 0; i < 3; i++) a = (a * F) / (F + isqrt(F * F + a * a));
  const a2 = (a * a) / F;
  let p = a;
  let sum = a;
  let k = 3n;
  let sg = true;
  while (p !== 0n) {
    p = (p * a2) / F;
    const t = p / k;
    sum += sg ? -t : t;
    sg = !sg;
    k += 2n;
  }
  let res = sum * 8n;
  if (inv) res = piFx(W) / 2n - res;
  return neg ? -res : res;
}

/** sqrt of a fixed-point value (floor). */
export function sqrtFx(a: bigint, W: number): bigint {
  return isqrt(a * pow10(W));
}
