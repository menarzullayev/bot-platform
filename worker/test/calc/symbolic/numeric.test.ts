import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { autoRange, compileFast, integrateNumeric, parseExpression, sampleFunction, toSegments } from "../../../src/calc";

const f = (s: string, v = "x") => compileFast(parseExpression(s), v);

describe("compileFast", () => {
  it("evaluates like Math", () => {
    expect(f("x^2+3x-1")(2)).toBe(9);
    expect(f("sin(x)*cos(x)")(0.7)).toBeCloseTo(Math.sin(0.7) * Math.cos(0.7), 15);
    expect(f("e^(-x^2)")(0.5)).toBeCloseTo(Math.exp(-0.25), 15);
    expect(f("sqrt(x)")(9)).toBe(3);
    expect(f("ln(x)")(Math.E)).toBeCloseTo(1, 15);
    expect(f("log(x)")(1000)).toBeCloseTo(3, 14);
    expect(f("log2(x)")(8)).toBeCloseTo(3, 14);
    expect(f("log(x, 3)")(81)).toBeCloseTo(4, 14);
    expect(f("2pi")(0)).toBeCloseTo(2 * Math.PI, 15);
    expect(f("abs(x)")(-4)).toBe(4);
    expect(f("5!")(0)).toBe(120);
    expect(f("sec(x)")(0)).toBe(1);
    expect(f("max(x, 3)")(5)).toBe(5);
    expect(f("x mod 3")(10)).toBe(1);
    expect(f("200+15%")(0)).toBeCloseTo(230, 12);
  });
  it("uses another variable", () => {
    expect(f("t^2", "t")(3)).toBe(9);
    expect(Number.isNaN(f("t^2 + y", "t")(3))).toBe(true); // unknown symbol -> NaN
  });
  it("real roots of negative numbers", () => {
    expect(f("cbrt(x)")(-8)).toBe(-2);
    expect(f("x^(1/3)")(-8)).toBeCloseTo(-2, 14);
    expect(f("x^(2/3)")(-8)).toBeCloseTo(4, 14);
    expect(Number.isNaN(f("sqrt(x)")(-1))).toBe(true);
    expect(Number.isNaN(f("x^(1/2)")(-1))).toBe(true);
  });
  it("division by zero and domain errors give Infinity/NaN, never an exception", () => {
    expect(f("1/x")(0)).toBe(Infinity);
    expect(Number.isNaN(f("ln(x)")(-1))).toBe(true);
    expect(Number.isNaN(f("asin(x)")(2))).toBe(true);
  });
  it("throws a SymbolicError for unknown functions (compile time)", () => {
    expect(() => compileFast(parseExpression("foo(x)"))).toThrow();
    expect(() => compileFast(parseExpression("gcd(x,2)"))).toThrow();
  });
  it("is closure based: no eval / new Function and no DOM or Node APIs in the module", () => {
    const dir = join(__dirname, "../../../src/calc/symbolic");
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/\beval\s*\(/);
      expect(src, file).not.toMatch(/new\s+Function/);
      expect(src, file).not.toMatch(/\bdocument\./);
      expect(src, file).not.toMatch(/\bwindow\./);
      expect(src, file).not.toMatch(/from\s+["']node:/);
      expect(src, file).not.toMatch(/\brequire\(/);
      expect(src, file).not.toMatch(/\bprocess\./);
      expect(src, file).not.toMatch(/\bBuffer\b/);
    }
  });
  it("is fast", () => {
    const g = f("sin(x)*e^(-x^2/10)+x^3/7");
    const t0 = performance.now();
    let s = 0;
    for (let i = 0; i < 100000; i++) s += g(i / 1000);
    const dt = performance.now() - t0;
    expect(Number.isFinite(s)).toBe(true);
    expect(dt).toBeLessThan(500);
  });
});

describe("sampleFunction", () => {
  it("smooth function: no breaks, requested resolution", () => {
    const s = sampleFunction(parseExpression("sin(x)"), -6, 6, 400);
    expect(s.breaks).toEqual([]);
    expect(s.points.length).toBe(401);
    expect(s.points[0][0]).toBe(-6);
    expect(s.points[400][0]).toBe(6);
    for (let i = 1; i < s.points.length; i++) expect(s.points[i][0]).toBeGreaterThan(s.points[i - 1][0]);
  });
  it("tan: a break at every pole", () => {
    const s = sampleFunction(parseExpression("tan(x)"), -3, 3, 300);
    expect(s.breaks.length).toBe(2);
    for (const b of s.breaks) {
      const left = s.points[b - 1][0];
      const right = s.points[b][0];
      const pole = Math.abs(left) < 2 ? Math.sign(left) * (Math.PI / 2) : 0;
      expect(Math.abs(right - pole)).toBeLessThan(1e-6);
      expect(Math.abs(left - pole)).toBeLessThan(1e-6);
    }
  });
  it("1/x: one break at 0", () => {
    const s = sampleFunction(parseExpression("1/x"), -1, 1, 200);
    expect(s.breaks.length).toBe(1);
    const b = s.breaks[0];
    expect(s.points[b - 1][0]).toBeLessThan(0);
    expect(s.points[b][0]).toBeGreaterThan(0);
    expect(toSegments(s).length).toBe(2);
  });
  it("1/(x-1)(x+1) style: asymptotes at both poles", () => {
    const s = sampleFunction(parseExpression("1/(x^2-1)"), -3, 3, 400);
    expect(s.breaks.length).toBeGreaterThanOrEqual(2);
  });
  it("domain border: sqrt starts at 0 exactly (refined by bisection)", () => {
    const s = sampleFunction(parseExpression("sqrt(x)"), -1, 4, 100);
    expect(s.breaks).toEqual([]);
    expect(s.points[0][0]).toBeGreaterThanOrEqual(-1e-12);
    expect(s.points[0][0]).toBeLessThan(1e-9);
    expect(s.points[0][1]).toBeLessThan(1e-4);
    expect(s.points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
  });
  it("ln: only the positive side", () => {
    const s = sampleFunction(parseExpression("ln(x)"), -2, 3, 200);
    expect(s.points.every((p) => p[0] > 0)).toBe(true);
    expect(s.points[0][0]).toBeLessThan(1e-6);
  });
  it("domain gap in the middle gives a break", () => {
    const s = sampleFunction(parseExpression("sqrt(1-x^2)"), -2, 2, 200);
    expect(s.points[0][0]).toBeGreaterThan(-1.0001);
    expect(s.points[s.points.length - 1][0]).toBeLessThan(1.0001);
    const t = sampleFunction(parseExpression("sqrt(x^2-1)"), -3, 3, 200);
    expect(t.breaks.length).toBe(1);
  });
  it("jump discontinuities (floor, sign) are breaks", () => {
    expect(sampleFunction(parseExpression("floor(x)"), -2.5, 2.5, 200).breaks.length).toBeGreaterThanOrEqual(4);
    expect(sampleFunction(parseExpression("sign(x)"), -1, 1, 200).breaks.length).toBe(1);
  });
  it("steep but continuous functions are not broken", () => {
    expect(sampleFunction(parseExpression("atan(50x)"), -1, 1, 200).breaks).toEqual([]);
    expect(sampleFunction(parseExpression("e^(5x)"), -1, 3, 200).breaks).toEqual([]);
    expect(sampleFunction(parseExpression("x^3"), -5, 5, 200).breaks).toEqual([]);
  });
  it("accepts a compiled function, swaps reversed ranges, caps n, handles degenerate input", () => {
    const g = f("x^2");
    expect(sampleFunction(g, 1, -1, 10).points[0][0]).toBe(-1);
    expect(sampleFunction(g, 0, 1, 1e9).points.length).toBeLessThanOrEqual(5001);
    expect(sampleFunction(g, 1, 1).points).toEqual([]);
    expect(sampleFunction(g, Number.NaN, 1).points).toEqual([]);
    expect(sampleFunction(f("1/0"), -1, 1, 10).points).toEqual([]);
  });
});

describe("autoRange", () => {
  it("covers a smooth curve with padding", () => {
    const s = sampleFunction(parseExpression("sin(x)"), -6, 6, 400);
    const r = autoRange(s.points);
    expect(r.min).toBeLessThan(-0.99);
    expect(r.max).toBeGreaterThan(0.99);
    expect(r.max).toBeLessThan(1.5);
  });
  it("ignores asymptote spikes", () => {
    const s = sampleFunction(parseExpression("tan(x)"), -3, 3, 400);
    const r = autoRange(s.points);
    expect(r.max - r.min).toBeLessThan(1e4);
    expect(r.max).toBeGreaterThan(5);
  });
  it("constant function and empty input", () => {
    const c = autoRange([
      [0, 5],
      [1, 5],
    ]);
    expect(c.min).toBeLessThan(5);
    expect(c.max).toBeGreaterThan(5);
    expect(autoRange([])).toEqual({ min: -1, max: 1 });
  });
  it("includes zero when the data is close to it", () => {
    const r = autoRange(Array.from({ length: 50 }, (_, i) => [i, 0.3 + i / 50] as [number, number]));
    expect(r.min).toBeLessThanOrEqual(0);
  });
});

describe("integrateNumeric (adaptive Gauss-Kronrod)", () => {
  const check = (expr: string, a: number, b: number, exact: number, tol = 1e-11): void => {
    const r = integrateNumeric(f(expr), a, b);
    expect(r.converged, expr).toBe(true);
    expect(Math.abs(r.value - exact) / Math.max(1, Math.abs(exact)), expr).toBeLessThan(tol);
  };
  it("matches known integrals to ~1e-11", () => {
    check("x^2", 0, 3, 9);
    check("sin(x)", 0, Math.PI, 2);
    check("e^x", 0, 1, Math.E - 1);
    check("1/(1+x^2)", -50, 50, 2 * Math.atan(50));
    check("exp(-x^2)", -8, 8, Math.sqrt(Math.PI));
    check("x^10", 0, 1, 1 / 11);
    check("ln(x)", 0, 1, -1, 1e-9);
    check("1/sqrt(x)", 0, 1, 2, 1e-9);
    check("abs(x)", -1, 2, 2.5);
    check("sin(100x)^2", 0, Math.PI, Math.PI / 2);
  });
  it("sign convention and zero interval", () => {
    expect(integrateNumeric(f("x"), 2, 0).value).toBeCloseTo(-2, 12);
    expect(integrateNumeric(f("x"), 1, 1).value).toBe(0);
  });
  it("non-integrable singularities do not converge", () => {
    expect(integrateNumeric(f("1/x"), -1, 1).converged).toBe(false);
    expect(integrateNumeric(f("1/x^2"), -1, 1).converged).toBe(false);
  });
});
