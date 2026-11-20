import { compileFast, parseExpression, type Ast } from "../../../src/calc";

/** Deterministic pseudo random numbers (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function points(lo: number, hi: number, n: number, seed = 7): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => lo + (hi - lo) * r());
}

export const close = (a: number, b: number, tol = 1e-5): boolean => Math.abs(a - b) <= tol * (1 + Math.abs(b));

export function fn(ast: Ast | string, v = "x"): (x: number) => number {
  return compileFast(typeof ast === "string" ? parseExpression(ast) : ast, v);
}

/** Central difference. */
export function numDiff(f: (x: number) => number, x: number): number {
  const h = 1e-6 * Math.max(1, Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}
