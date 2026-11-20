// Exact rational numbers on BigInt. Sizes are bounded: anything beyond ~70 digits throws too_complex.

import { Decimal } from "../decimal";
import { SymbolicError } from "./types";

export interface Q {
  readonly n: bigint;
  readonly d: bigint;
}

const LIM = 10n ** 70n;

export function gcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function q(n: bigint | number, d: bigint | number = 1n): Q {
  let N = typeof n === "bigint" ? n : BigInt(n);
  let D = typeof d === "bigint" ? d : BigInt(d);
  if (D === 0n) throw new SymbolicError("div_zero");
  if (D < 0n) {
    N = -N;
    D = -D;
  }
  const g = gcd(N, D);
  if (g > 1n) {
    N /= g;
    D /= g;
  }
  if (N > LIM || N < -LIM || D > LIM) throw new SymbolicError("too_complex", "number is too large");
  return { n: N, d: D };
}

export const Q0: Q = { n: 0n, d: 1n };
export const Q1: Q = { n: 1n, d: 1n };
export const QM1: Q = { n: -1n, d: 1n };
export const QHALF: Q = { n: 1n, d: 2n };

export const qadd = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qsub = (a: Q, b: Q): Q => q(a.n * b.d - b.n * a.d, a.d * b.d);
export const qmul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export const qdiv = (a: Q, b: Q): Q => {
  if (b.n === 0n) throw new SymbolicError("div_zero");
  return q(a.n * b.d, a.d * b.n);
};
export const qneg = (a: Q): Q => ({ n: -a.n, d: a.d });
export const qabs = (a: Q): Q => (a.n < 0n ? { n: -a.n, d: a.d } : a);
export const qsign = (a: Q): -1 | 0 | 1 => (a.n === 0n ? 0 : a.n < 0n ? -1 : 1);
export const qisInt = (a: Q): boolean => a.d === 1n;
export const qisZero = (a: Q): boolean => a.n === 0n;
export const qeq = (a: Q, b: Q): boolean => a.n === b.n && a.d === b.d;
export const qcmp = (a: Q, b: Q): -1 | 0 | 1 => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};

/** floor(a) as BigInt. */
export function qfloor(a: Q): bigint {
  let f = a.n / a.d;
  if (a.n % a.d !== 0n && a.n < 0n) f -= 1n;
  return f;
}

/** a^k for an integer k (|k| <= 400, bounded result size). */
export function qpow(a: Q, k: number | bigint): Q {
  const kk = Number(k);
  if (!Number.isInteger(kk) || Math.abs(kk) > 400) throw new SymbolicError("too_complex");
  if (kk === 0) return Q1;
  if (a.n === 0n) {
    if (kk < 0) throw new SymbolicError("div_zero");
    return Q0;
  }
  const ak = Math.abs(kk);
  if (a.n === 1n && a.d === 1n) return Q1;
  if (a.n === -1n && a.d === 1n) return ak % 2 === 0 ? Q1 : QM1;
  const digits = a.n.toString().length + a.d.toString().length;
  if (digits * ak > 150) throw new SymbolicError("too_complex");
  const base = kk > 0 ? a : { n: a.d, d: a.n };
  const N = base.n ** BigInt(ak);
  const D = base.d ** BigInt(ak);
  return q(N, D);
}

export function qToNumber(a: Q): number {
  if (a.d === 1n) return Number(a.n);
  return Number(a.n) / Number(a.d);
}

/** Exact rational from a double (only for "nice" values such as 0.5 or 3), otherwise null. */
export function qFromNumber(x: number): Q | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x)) return Math.abs(x) < 1e15 ? q(BigInt(x)) : null;
  const s = x.toString();
  if (/e/i.test(s)) return null;
  const dot = s.indexOf(".");
  const frac = s.length - dot - 1;
  if (frac > 15) return null;
  return q(BigInt(s.replace(".", "")), 10n ** BigInt(frac));
}

export function qFromDecimal(x: Decimal): Q | null {
  if (x.nd > 30 || x.s > 30 || x.s < -30) return null;
  if (x.s >= 0) return q(x.m, 10n ** BigInt(x.s));
  return q(x.m * 10n ** BigInt(-x.s), 1n);
}

export function qToString(a: Q): string {
  return a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
}

/** Integer k-th root of a non-negative BigInt (floor). */
export function iroot(n: bigint, k: number): bigint {
  if (n < 2n) return n;
  if (k === 1) return n;
  const K = BigInt(k);
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / k));
  for (;;) {
    const y = ((K - 1n) * x + n / x ** (K - 1n)) / K;
    if (y >= x) return x;
    x = y;
  }
}
