import { describe, expect, it } from "vitest";
import { definiteIntegral, derivative, integrate, parseExpression, simplify, toText } from "../../../src/calc";
import { close, fn, numDiff, points } from "./util";

// [integrand, lo, hi] - the antiderivative is differentiated and compared with the integrand at random points.
const TABLE: Array<[string, number, number]> = [
  ["0", -2, 2],
  ["5", -2, 2],
  ["x", -2, 2],
  ["x^2", -2, 2],
  ["3x^2+2x+1", -2, 2],
  ["x^-2", 0.3, 3],
  ["x^(1/2)", 0.3, 3],
  ["1/x", 0.3, 3],
  ["1/(2x)", 0.3, 3],
  ["e^x", -2, 2],
  ["e^(2x)", -2, 2],
  ["e^(-x)", -2, 2],
  ["2^x", -2, 2],
  ["3^(2x)", -2, 2],
  ["sin x", -3, 3],
  ["cos x", -3, 3],
  ["sin(2x)", -3, 3],
  ["cos(3x+1)", -3, 3],
  ["sec(x)^2", -1.2, 1.2],
  ["1/cos(x)^2", -1.2, 1.2],
  ["1/sin(x)^2", 0.3, 2.8],
  ["tan x", -1.2, 1.2],
  ["cot x", 0.3, 2.8],
  ["sinh x", -2, 2],
  ["cosh(2x)", -2, 2],
  ["1/(1+x^2)", -3, 3],
  ["1/(4+x^2)", -3, 3],
  ["1/(x^2+2x+5)", -3, 3],
  ["1/sqrt(1-x^2)", -0.9, 0.9],
  ["x e^x", -2, 2],
  ["x sin x", -3, 3],
  ["x cos x", -3, 3],
  ["x^2 e^x", -2, 2],
  ["x^2 sin x", -3, 3],
  ["x^3 e^(2x)", -1, 1],
  ["ln x", 0.2, 4],
  ["x ln x", 0.2, 4],
  ["x^2 ln x", 0.2, 4],
  ["ln(2x+1)", 0.1, 4],
  ["(2x+1)^5", -2, 2],
  ["1/(2x+1)", 0.1, 4],
  ["sqrt(3x+2)", 0.1, 4],
  ["x/(x+1)", 0.2, 4],
  ["x/(x^2+1)", -3, 3],
  ["(x^2+1)/(x-1)", 1.3, 4],
  ["1/((x+1)(x+2))", 0.2, 4],
  ["1/(x^2-1)", 1.3, 4],
  ["1/(x^2-3x+2)", 2.3, 5],
  ["x e^(x^2)", -2, 2],
  ["x cos(x^2)", -2, 2],
  ["cos(x) e^(sin x)", -3, 3],
  ["sin(x)^2", -3, 3],
  ["cos(x)^2", -3, 3],
  ["sin(x)^3", -3, 3],
  ["cos(x)^4", -3, 3],
  ["sin(x) cos(x)", -3, 3],
  ["e^x sin x", -2, 2],
  ["e^(2x) cos(3x)", -2, 2],
  ["atan x", -3, 3],
  ["asin x", -0.9, 0.9],
  ["tan(x)^2", -1.2, 1.2],
  ["ln(x)/x", 0.2, 4],
  ["x sqrt(x+1)", 0.1, 4],
  ["(3x+1)/(x^2+4)", -3, 3],
  ["sin(x)/cos(x)^2", -1.2, 1.2],
  ["2x/(x^2+1)", -3, 3],
  ["e^x/(1+e^x)", -2, 2],
  ["(x+1)^2", -3, 3],
  ["x (x^2+1)^3", -2, 2],
  ["1/(x+3)^2", 0.1, 4],
  ["x^2/(x+1)", 0.2, 4],
  ["x sin(2x+1)", -2, 2],
];

describe("integrate: table checked by differentiation", () => {
  it("has 60+ cases", () => expect(TABLE.length).toBeGreaterThanOrEqual(60));
  for (const [expr, lo, hi] of TABLE) {
    it(`∫ ${expr} dx`, () => {
      const r = integrate(expr);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (!r.ok) return;
      const f = fn(expr);
      const F = fn(r.antiderivative);
      // numerical derivative of the antiderivative
      let checked = 0;
      for (const x of points(lo, hi, 9, 11)) {
        const d = numDiff(F, x);
        const v = f(x);
        if (!Number.isFinite(d) || !Number.isFinite(v)) continue;
        checked++;
        expect(close(d, v, 5e-5), `${expr} at x=${x}: F'=${d} f=${v}`).toBe(true);
      }
      expect(checked).toBeGreaterThanOrEqual(3);
      // symbolic derivative of the antiderivative
      const dr = derivative(r.antiderivative);
      expect(dr.ok, JSON.stringify(dr)).toBe(true);
      if (dr.ok) {
        const g = fn(dr.result);
        for (const x of points(lo, hi, 4, 3)) {
          const v = f(x);
          const w = g(x);
          if (Number.isFinite(v) && Number.isFinite(w)) expect(close(w, v, 1e-6), `${expr}: symbolic F' at ${x}: ${w} vs ${v}`).toBe(true);
        }
      }
    });
  }
});

describe("integrate: exact forms and traces", () => {
  const text = (s: string): string => {
    const r = integrate(s);
    if (!r.ok) throw new Error(`${s}: ${r.error}`);
    return r.text;
  };
  it("adds the constant of integration", () => {
    expect(text("x^2")).toBe("x³/3 + C");
    expect(text("1/x")).toBe("ln|x| + C");
    expect(text("e^x")).toBe("e^x + C");
    expect(text("cos(x)")).toBe("sin(x) + C");
    expect(text("1/(1+x^2)")).toBe("atan(x) + C");
    expect(text("5")).toBe("5x + C");
    const r = integrate("x");
    expect(r.ok && toText(r.result)).toBe("x²/2 + C");
  });
  it("by parts and substitution leave a trace", () => {
    const rules = (s: string): string[] => {
      const r = integrate(s);
      return r.ok ? r.steps.map((st) => st.rule) : [];
    };
    expect(rules("x e^x")).toContain("by_parts");
    expect(rules("x sin(x)")).toContain("by_parts");
    expect(rules("ln(x)")).toContain("table");
    expect(rules("x e^(x^2)")).toContain("substitute");
    expect(rules("1/((x+1)(x+2))")).toContain("partial_fractions");
    expect(rules("x^2+x")).toContain("sum");
    expect(rules("3x^2")).toContain("const_mult");
    expect(rules("x^2")).toContain("power");
  });
  it("accepts an AST and other variables", () => {
    const r = integrate(parseExpression("t^2"), "t");
    expect(r.ok && r.text).toBe("t³/3 + C");
    const k = integrate("a*x", "x");
    expect(k.ok && k.text).toBe("ax²/2 + C");
  });
  it("is deterministic and re-simplifiable", () => {
    const r = integrate("(2x+1)^5");
    expect(r.ok).toBe(true);
    if (r.ok) expect(toText(simplify(r.antiderivative))).toBe(toText(r.antiderivative));
  });
});

describe("integrate: unsupported cases are reported, never thrown", () => {
  for (const s of ["sin(x^2)", "e^(x^2)", "1/ln(x)", "x^x", "sqrt(1+x^3)", "tan(x^2)", "x!", "sin(x)/x"]) {
    it(s, () => {
      const r = integrate(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(["unsupported", "too_complex"]).toContain(r.error);
    });
  }
});

describe("definiteIntegral", () => {
  const val = (e: string, a: number | string, b: number | string): number => {
    const r = definiteIntegral(e, a, b);
    if (!r.ok) throw new Error(`${e}: ${r.error}`);
    return Number(r.value);
  };
  it("analytic results are exact to many digits", () => {
    const r = definiteIntegral("sin(x)", 0, "pi");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method).toBe("analytic");
      expect(r.value).toBe("2");
      expect(r.exactText).toBe("2");
    }
    expect(val("x^2", 0, 3)).toBe(9);
    expect(val("1/x", 1, "e")).toBeCloseTo(1, 15);
    expect(val("e^x", 0, 1)).toBeCloseTo(Math.E - 1, 15);
    expect(val("cos(x)", 0, "pi/2")).toBeCloseTo(1, 15);
    expect(val("1/(1+x^2)", 0, 1)).toBeCloseTo(Math.PI / 4, 15);
    expect(val("x e^x", 0, 1)).toBeCloseTo(1, 15);
    expect(val("sqrt(x)", 0, 4)).toBeCloseTo(16 / 3, 14);
  });
  it("reversed bounds change the sign", () => {
    expect(val("x^2", 3, 0)).toBe(-9);
  });
  it("falls back to numeric integration (relative error 1e-10)", () => {
    const r = definiteIntegral("exp(-x^2)", 0, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method).toBe("numeric");
      expect(Math.abs(Number(r.value) - 0.7468241328124271) / 0.7468241328124271).toBeLessThan(1e-10);
    }
    expect(Math.abs(val("sin(x)/x", 0.0001, 3) - (1.848652527999 - 0.0001))).toBeLessThan(1e-5);
    expect(Math.abs(val("exp(-x^2)", -10, 10) - Math.sqrt(Math.PI)) / Math.sqrt(Math.PI)).toBeLessThan(1e-10);
  });
  it("integrable singularities at the ends", () => {
    expect(Math.abs(val("ln(x)", 0, 1) + 1)).toBeLessThan(1e-9);
    expect(Math.abs(val("1/sqrt(x)", 0, 1) - 2)).toBeLessThan(1e-9);
  });
  it("divergent integrals are reported", () => {
    for (const [e, a, b] of [
      ["1/x", -1, 1],
      ["1/x^2", -1, 1],
      ["1/x", 0, 1],
    ] as const) {
      const r = definiteIntegral(e, a, b);
      expect(r.ok, e).toBe(false);
      if (!r.ok) expect(r.error).toBe("divergent");
    }
  });
  it("rejects bad bounds", () => {
    expect(definiteIntegral("x", Number.NaN, 1).ok).toBe(false);
    expect(definiteIntegral("x", "1/0", 1).ok).toBe(false);
    expect(definiteIntegral("x", "(", 1).ok).toBe(false);
  });
});
