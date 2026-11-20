// Immutable arbitrary-precision decimal: value = m * 10^(-s), m a BigInt without trailing zeros,
// s any integer (negative for large multiples of ten). Canonical form, so eq() is a field comparison.

import { CalcError } from "./errors";
import { expParts, icbrt, isqrt, lnRefined, ndigits, pow10 } from "./fixed";

export type RoundingMode = "half-up" | "half-even" | "down" | "up";
type InternalMode = RoundingMode | "floor" | "ceil";

const cfg = { precision: 34, maxDigits: 2000, maxExponent: 10000 };

function overflow(msg = "number is too large or too small"): CalcError {
  return new CalcError("overflow", msg);
}

const NUM_RE = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

export type DecimalLike = string | number | bigint | Decimal;

export class Decimal {
  /** Mantissa (signed, no trailing zeros). */
  readonly m: bigint;
  /** Scale: value = m * 10^-s. */
  readonly s: number;
  /** Number of decimal digits of |m|. */
  readonly nd: number;

  private constructor(m: bigint, s: number, nd: number) {
    this.m = m;
    this.s = s;
    this.nd = nd;
  }

  static readonly ZERO: Decimal = new Decimal(0n, 0, 1);
  static readonly ONE: Decimal = new Decimal(1n, 0, 1);

  // ---------- configuration ----------

  /** Default working precision in significant digits. */
  static get precision(): number {
    return cfg.precision;
  }
  static set precision(n: number) {
    if (!Number.isInteger(n) || n < 5 || n > 500) throw new RangeError("precision must be an integer in [5, 500]");
    cfg.precision = n;
  }
  static get maxDigits(): number {
    return cfg.maxDigits;
  }
  static set maxDigits(n: number) {
    if (!Number.isInteger(n) || n < 50 || n > 100000) throw new RangeError("maxDigits out of range");
    cfg.maxDigits = n;
  }
  static get maxExponent(): number {
    return cfg.maxExponent;
  }
  static set maxExponent(n: number) {
    if (!Number.isInteger(n) || n < 50 || n > 1000000) throw new RangeError("maxExponent out of range");
    cfg.maxExponent = n;
  }

  // ---------- construction ----------

  /** Build from a mantissa and scale (value = m * 10^-s); normalizes and enforces the size limits. */
  static make(m: bigint, s: number): Decimal {
    if (m === 0n) return Decimal.ZERO;
    const str = (m < 0n ? -m : m).toString();
    let nd = str.length;
    if (str.charCodeAt(nd - 1) === 48) {
      let k = nd;
      while (str.charCodeAt(k - 1) === 48) k--;
      const z = nd - k;
      m = m / pow10(z);
      s -= z;
      nd = k;
    }
    if (nd > cfg.maxDigits) throw overflow();
    const e10 = nd - 1 - s;
    if (e10 > cfg.maxExponent || e10 < -cfg.maxExponent) throw overflow();
    return new Decimal(m, s, nd);
  }

  /**
   * Fixed-point result (v / 10^W) rounded to `sig` significant digits (half-up) when it has more.
   * Without `sig` the value is taken exactly.
   */
  static fromScaled(v: bigint, W: number, sig?: number): Decimal {
    if (sig !== undefined && v !== 0n) {
      const nd = ndigits(v);
      if (nd > sig) {
        const drop = nd - sig;
        const p = pow10(drop);
        let q = v / p;
        const r = v % p;
        if ((r < 0n ? -r : r) * 2n >= p) q += v < 0n ? -1n : 1n;
        return Decimal.make(q, W - drop);
      }
    }
    return Decimal.make(v, W);
  }

  static parse(str: string): Decimal {
    const mt = NUM_RE.exec(str.trim());
    if (!mt || ((mt[2] ?? "") + (mt[3] ?? "")).length === 0) throw new CalcError("syntax", "invalid number", { pos: 0 });
    const neg = mt[1] === "-";
    const ip = mt[2] ?? "";
    const fp = mt[3] ?? "";
    const ex = mt[4] ? Number(mt[4]) : 0;
    if (!Number.isFinite(ex) || Math.abs(ex) > 1_000_000) throw overflow();
    const digits = (ip + fp).replace(/^0+/, "");
    if (digits === "") return Decimal.ZERO;
    if (digits.length > 20000) throw overflow();
    let m = BigInt(digits);
    if (neg) m = -m;
    return Decimal.make(m, fp.length - ex);
  }

  static from(x: DecimalLike): Decimal {
    if (x instanceof Decimal) return x;
    if (typeof x === "bigint") return Decimal.make(x, 0);
    if (typeof x === "number") {
      if (!Number.isFinite(x)) throw new CalcError("domain", "number is not finite");
      return Decimal.parse(String(x));
    }
    return Decimal.parse(x);
  }

  // ---------- inspection ----------

  sign(): -1 | 0 | 1 {
    return this.m > 0n ? 1 : this.m < 0n ? -1 : 0;
  }
  isZero(): boolean {
    return this.m === 0n;
  }
  isNegative(): boolean {
    return this.m < 0n;
  }
  isInteger(): boolean {
    return this.s <= 0;
  }
  /** Decimal exponent of the leading digit (1234.5 -> 3, 0.01 -> -2). Zero gives 0. */
  get exponent(): number {
    return this.m === 0n ? 0 : this.nd - 1 - this.s;
  }
  /** Significant digits of |value| as a string (no sign, no trailing zeros). */
  digits(): string {
    return (this.m < 0n ? -this.m : this.m).toString();
  }

  /** Approximate log10 of |value| (value must be non-zero). */
  approxLog10(): number {
    const str = this.digits();
    const head = Number(str.slice(0, 15));
    return Math.log10(head) + (this.nd - Math.min(15, this.nd)) - this.s;
  }

  // ---------- comparison ----------

  cmp(o: Decimal): -1 | 0 | 1 {
    const a = this.sign();
    const b = o.sign();
    if (a !== b) return a < b ? -1 : 1;
    if (a === 0) return 0;
    if (this.m === o.m && this.s === o.s) return 0;
    const ea = this.exponent;
    const eb = o.exponent;
    if (ea !== eb) return ea > eb ? a : a === 1 ? -1 : 1;
    const sc = Math.max(this.s, o.s);
    const x = this.m * pow10(sc - this.s);
    const y = o.m * pow10(sc - o.s);
    return x === y ? 0 : x < y ? -1 : 1;
  }
  eq(o: Decimal): boolean {
    return this.m === o.m && this.s === o.s;
  }
  lt(o: Decimal): boolean {
    return this.cmp(o) < 0;
  }
  lte(o: Decimal): boolean {
    return this.cmp(o) <= 0;
  }
  gt(o: Decimal): boolean {
    return this.cmp(o) > 0;
  }
  gte(o: Decimal): boolean {
    return this.cmp(o) >= 0;
  }

  // ---------- arithmetic (exact unless stated) ----------

  neg(): Decimal {
    return this.m === 0n ? this : new Decimal(-this.m, this.s, this.nd);
  }
  abs(): Decimal {
    return this.m >= 0n ? this : new Decimal(-this.m, this.s, this.nd);
  }

  add(o: Decimal): Decimal {
    if (this.m === 0n) return o;
    if (o.m === 0n) return this;
    if (this.s === o.s) return Decimal.make(this.m + o.m, this.s);
    if (this.s > o.s) return Decimal.make(this.m + o.m * pow10(this.s - o.s), this.s);
    return Decimal.make(this.m * pow10(o.s - this.s) + o.m, o.s);
  }

  sub(o: Decimal): Decimal {
    return this.add(o.neg());
  }

  mul(o: Decimal): Decimal {
    if (this.m === 0n || o.m === 0n) return Decimal.ZERO;
    return Decimal.make(this.m * o.m, this.s + o.s);
  }

  /** Division rounded (half-up) to `digits` significant digits (default: working precision). */
  div(o: Decimal, digits: number = cfg.precision): Decimal {
    if (o.m === 0n) throw new CalcError("div0", "division by zero");
    if (this.m === 0n) return Decimal.ZERO;
    const guard = digits + 3;
    const k = Math.max(0, guard + o.nd - this.nd);
    const num = this.m * pow10(k);
    let q = num / o.m;
    const r = num % o.m;
    let scale = k + this.s - o.s;
    if (r !== 0n) {
      q = q * 10n + (this.m < 0n !== o.m < 0n ? -1n : 1n); // sticky digit for correct rounding
      scale += 1;
    }
    return Decimal.make(q, scale).roundSig(digits);
  }

  /** Floored modulo: the result has the sign of the divisor. */
  mod(o: Decimal): Decimal {
    if (o.m === 0n) throw new CalcError("div0", "modulo by zero");
    if (this.m === 0n) return Decimal.ZERO;
    const sc = Math.max(this.s, o.s);
    const a = this.m * pow10(sc - this.s);
    const b = o.m * pow10(sc - o.s);
    let r = a % b;
    if (r !== 0n && r < 0n !== b < 0n) r += b;
    return Decimal.make(r, sc);
  }

  sqrt(digits: number = cfg.precision): Decimal {
    if (this.m < 0n) throw new CalcError("domain", "square root of a negative number", { fn: "sqrt" });
    if (this.m === 0n) return Decimal.ZERO;
    let t = Math.max(0, 2 * (digits + 3) - this.nd);
    if ((((this.s + t) % 2) + 2) % 2 !== 0) t++;
    const N = this.m * pow10(t);
    const r = isqrt(N);
    let sc = (this.s + t) / 2;
    let q = r;
    if (r * r !== N) {
      q = r * 10n + 1n;
      sc += 1;
    }
    return Decimal.make(q, sc).roundSig(digits);
  }

  cbrt(digits: number = cfg.precision): Decimal {
    if (this.m === 0n) return Decimal.ZERO;
    const neg = this.m < 0n;
    let t = Math.max(0, 3 * (digits + 3) - this.nd);
    while ((((this.s + t) % 3) + 3) % 3 !== 0) t++;
    const N = (neg ? -this.m : this.m) * pow10(t);
    const r = icbrt(N);
    let sc = (this.s + t) / 3;
    let q = r;
    if (r * r * r !== N) {
      q = r * 10n + 1n;
      sc += 1;
    }
    const res = Decimal.make(neg ? -q : q, sc).roundSig(digits);
    return res;
  }

  /**
   * Power. Integer exponents (|exp| <= 10000) are exact for integer bases and rounded to `digits`
   * for fractional bases; fractional exponents use exp(y*ln x) and need a positive base.
   */
  pow(e: Decimal, digits: number = cfg.precision): Decimal {
    if (e.m === 0n) return Decimal.ONE;
    if (this.m === 0n) {
      if (e.m < 0n) throw new CalcError("div0", "zero to a negative power");
      return Decimal.ZERO;
    }
    if (e.isInteger()) {
      if (e.exponent > 4) throw overflow("exponent is too large");
      const n = Number(e.m) * 10 ** -e.s;
      if (Math.abs(n) > cfg.maxExponent) throw overflow("exponent is too large");
      return this.powInt(n, digits);
    }
    if (this.m < 0n) throw new CalcError("domain", "negative base with a fractional exponent", { fn: "pow" });
    if (this.eq(Decimal.ONE)) return Decimal.ONE;
    if (e.m === 5n && e.s === 1) return this.sqrt(digits);
    const ln = lnRefined(this.m, this.s, digits + 10);
    const r = expParts(e.m * ln.v, e.s + ln.W, digits + 10);
    return Decimal.make(r.m, r.s).roundSig(digits);
  }

  private powInt(n: number, digits: number): Decimal {
    let k = Math.abs(n);
    const L = this.approxLog10();
    if (Math.abs(L) * k > cfg.maxExponent + 1) throw overflow();
    const isInt = this.s <= 0;
    if (isInt && k * (L + this.s) > cfg.maxDigits + 1) throw overflow();
    const keep = digits + 10;
    const fit = (x: Decimal): Decimal => (isInt || x.nd <= keep ? x : x.roundSig(keep));
    let result: Decimal = Decimal.ONE;
    let base: Decimal = this;
    for (;;) {
      if (k & 1) result = fit(result.mul(base));
      k = Math.floor(k / 2);
      if (k === 0) break;
      base = fit(base.mul(base));
    }
    if (n < 0) return Decimal.ONE.div(result, digits);
    return isInt ? result : result.roundSig(digits);
  }

  // ---------- rounding ----------

  private roundTo(dp: number, mode: InternalMode): Decimal {
    if (this.s <= dp) return this;
    const drop = this.s - dp;
    const p = pow10(drop);
    let q = this.m / p;
    const r = this.m % p;
    if (r !== 0n) {
      const neg = this.m < 0n;
      const away = neg ? -1n : 1n;
      const ar = r < 0n ? -r : r;
      switch (mode) {
        case "down":
          break;
        case "up":
          q += away;
          break;
        case "floor":
          if (neg) q -= 1n;
          break;
        case "ceil":
          if (!neg) q += 1n;
          break;
        case "half-up":
          if (ar * 2n >= p) q += away;
          break;
        case "half-even": {
          const c = ar * 2n;
          if (c > p || (c === p && (q & 1n) === 1n)) q += away;
          break;
        }
      }
    }
    return Decimal.make(q, dp);
  }

  /** Round to `dp` fractional digits (negative dp rounds to tens, hundreds, ...). */
  round(dp = 0, mode: RoundingMode = "half-up"): Decimal {
    return this.roundTo(dp, mode);
  }
  floor(): Decimal {
    return this.roundTo(0, "floor");
  }
  ceil(): Decimal {
    return this.roundTo(0, "ceil");
  }
  trunc(): Decimal {
    return this.roundTo(0, "down");
  }
  /** Round to `n` significant digits. */
  roundSig(n: number, mode: RoundingMode = "half-up"): Decimal {
    if (this.nd <= n) return this;
    return this.roundTo(this.s - (this.nd - n), mode);
  }

  // ---------- output ----------

  /** Plain notation, never exponent form. */
  toString(): string {
    if (this.m === 0n) return "0";
    const neg = this.m < 0n;
    const str = this.digits();
    let out: string;
    if (this.s <= 0) out = str + "0".repeat(-this.s);
    else if (this.s >= str.length) out = "0." + "0".repeat(this.s - str.length) + str;
    else out = str.slice(0, str.length - this.s) + "." + str.slice(str.length - this.s);
    return neg ? "-" + out : out;
  }

  toJSON(): string {
    return this.toString();
  }

  /** Exactly `dp` fractional digits (half-up). */
  toFixed(dp = 0): string {
    if (!Number.isInteger(dp) || dp < 0) dp = 0;
    const r = this.roundTo(dp, "half-up");
    if (r.m === 0n) return dp > 0 ? "0." + "0".repeat(dp) : "0";
    const base = r.toString();
    if (dp === 0) return base;
    const dot = base.indexOf(".");
    if (dot < 0) return base + "." + "0".repeat(dp);
    return base + "0".repeat(dp - (base.length - dot - 1));
  }

  /** Round to n significant digits and print without trailing zeros. */
  toSignificant(n: number): string {
    return this.roundSig(Math.max(1, n)).toString();
  }

  toNumber(): number {
    return Number(this.toString());
  }
}
